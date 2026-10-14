-- 地図連動型 店舗別在庫検索サービス（デモ版）初期スキーマ
-- Supabase の SQL Editor に貼り付けて実行するか、`npm run db:setup` で適用する。

create extension if not exists postgis with schema extensions;
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- JANコード（EAN-13 / EAN-8）のチェックディジット検証
-- src/lib/jan.ts と同じ計算。テストは src/lib/jan.test.ts
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_jan(code text)
returns boolean
language plpgsql
immutable
as $$
declare
  n int;
  s int := 0;
  d int;
begin
  if code is null or code !~ '^([0-9]{8}|[0-9]{13})$' then
    return false;
  end if;
  n := length(code);
  for i in 1..n - 1 loop
    d := substr(code, i, 1)::int;
    -- チェックディジットの左隣から、重み 3,1,3,1... の順
    if (n - i) % 2 = 1 then
      s := s + d * 3;
    else
      s := s + d;
    end if;
  end loop;
  return (10 - s % 10) % 10 = substr(code, n, 1)::int;
end;
$$;

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  opening_hours text,
  location geography(point, 4326) not null,
  created_at timestamptz not null default now()
);
create index stores_location_idx on public.stores using gist (location);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  jan_code text not null unique check (public.is_valid_jan(jan_code)),
  name text not null,
  name_normalized text not null, -- 検索用。src/lib/normalize.ts で正規化した名前
  category text,
  created_at timestamptz not null default now()
);
create index products_name_normalized_idx on public.products (name_normalized);

create table public.inventories (
  store_id uuid not null references public.stores (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity integer not null check (quantity >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (store_id, product_id)
);
create index inventories_product_in_stock_idx on public.inventories (product_id) where quantity > 0;

create table public.inventory_logs (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  before_quantity integer not null,
  after_quantity integer not null,
  change_type text not null check (change_type in ('increase', 'decrease', 'stocktake')),
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index inventory_logs_store_changed_idx on public.inventory_logs (store_id, changed_at desc);

create table public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  display_name text not null
);

-- 店舗の座標を緯度経度で返すビュー（PostgREST から geography を直接読みにくいため）
create view public.store_list
with (security_invoker = true) as
select
  id,
  name,
  address,
  opening_hours,
  st_y(location::geometry) as lat,
  st_x(location::geometry) as lng
from public.stores;

-- ---------------------------------------------------------------------------
-- スタッフの判定（RLS の再帰を避けるため security definer）
-- ---------------------------------------------------------------------------
create or replace function public.my_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select store_id from public.staff_members where user_id = auth.uid();
$$;

create or replace function public.is_store_staff(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_members
    where user_id = auth.uid() and store_id = p_store_id
  );
$$;

-- ---------------------------------------------------------------------------
-- 在庫の更新（同時更新でも数が狂わないよう、行ロックをとって1回の処理で行う）
-- ---------------------------------------------------------------------------
create or replace function public.adjust_inventory(p_store_id uuid, p_product_id uuid, p_delta integer)
returns public.inventories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer;
  v_row public.inventories;
begin
  if auth.uid() is null or not public.is_store_staff(p_store_id) then
    raise exception 'この店舗の在庫を更新する権限がありません' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception '増減する数を指定してください' using errcode = '22023';
  end if;

  insert into public.inventories (store_id, product_id, quantity, updated_by)
  values (p_store_id, p_product_id, 0, auth.uid())
  on conflict (store_id, product_id) do nothing;

  select quantity into v_before
  from public.inventories
  where store_id = p_store_id and product_id = p_product_id
  for update;

  if v_before + p_delta < 0 then
    raise exception '在庫数を0未満にはできません（現在 % 個）', v_before using errcode = '22003';
  end if;

  update public.inventories
  set quantity = v_before + p_delta, updated_at = now(), updated_by = auth.uid()
  where store_id = p_store_id and product_id = p_product_id
  returning * into v_row;

  insert into public.inventory_logs (store_id, product_id, before_quantity, after_quantity, change_type, changed_by)
  values (
    p_store_id, p_product_id, v_before, v_row.quantity,
    case when p_delta > 0 then 'increase' else 'decrease' end,
    auth.uid()
  );

  return v_row;
end;
$$;

create or replace function public.set_inventory(p_store_id uuid, p_product_id uuid, p_quantity integer)
returns public.inventories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer;
  v_row public.inventories;
begin
  if auth.uid() is null or not public.is_store_staff(p_store_id) then
    raise exception 'この店舗の在庫を更新する権限がありません' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception '在庫数は0以上で指定してください' using errcode = '22003';
  end if;

  insert into public.inventories (store_id, product_id, quantity, updated_by)
  values (p_store_id, p_product_id, 0, auth.uid())
  on conflict (store_id, product_id) do nothing;

  select quantity into v_before
  from public.inventories
  where store_id = p_store_id and product_id = p_product_id
  for update;

  update public.inventories
  set quantity = p_quantity, updated_at = now(), updated_by = auth.uid()
  where store_id = p_store_id and product_id = p_product_id
  returning * into v_row;

  insert into public.inventory_logs (store_id, product_id, before_quantity, after_quantity, change_type, changed_by)
  values (p_store_id, p_product_id, v_before, p_quantity, 'stocktake', auth.uid());

  return v_row;
end;
$$;

-- 未登録のJANコードを、スタッフが簡易登録する
create or replace function public.register_product(p_jan_code text, p_name text, p_name_normalized text, p_category text default null)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.products;
begin
  if auth.uid() is null or public.my_store_id() is null then
    raise exception '商品を登録する権限がありません' using errcode = '42501';
  end if;
  if not public.is_valid_jan(p_jan_code) then
    raise exception 'JANコードが正しくありません' using errcode = '22023';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception '商品名を入力してください' using errcode = '22023';
  end if;

  insert into public.products (jan_code, name, name_normalized, category)
  values (p_jan_code, trim(p_name), p_name_normalized, nullif(trim(p_category), ''))
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 現在地から近い順の店舗（商品を指定すると、その商品の在庫数も返す）
-- ---------------------------------------------------------------------------
create or replace function public.stores_nearby(
  p_lat double precision,
  p_lng double precision,
  p_product_id uuid default null,
  p_in_stock_only boolean default false
)
returns table (
  id uuid,
  name text,
  address text,
  opening_hours text,
  lat double precision,
  lng double precision,
  distance_m double precision,
  quantity integer,
  updated_at timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  select
    s.id,
    s.name,
    s.address,
    s.opening_hours,
    st_y(s.location::geometry),
    st_x(s.location::geometry),
    st_distance(s.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography),
    i.quantity,
    i.updated_at
  from public.stores s
  left join public.inventories i
    on i.store_id = s.id and i.product_id = p_product_id
  where not p_in_stock_only or coalesce(i.quantity, 0) > 0
  order by s.location <-> st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
$$;

-- ---------------------------------------------------------------------------
-- アクセス制御（Row Level Security）
-- ---------------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.inventories enable row level security;
alter table public.inventory_logs enable row level security;
alter table public.staff_members enable row level security;

create policy "stores are readable by everyone" on public.stores
  for select to anon, authenticated using (true);
create policy "products are readable by everyone" on public.products
  for select to anon, authenticated using (true);
create policy "inventories are readable by everyone" on public.inventories
  for select to anon, authenticated using (true);
create policy "logs are readable by staff of the store" on public.inventory_logs
  for select to authenticated using (public.is_store_staff(store_id));
create policy "staff can see members of their store" on public.staff_members
  for select to authenticated using (store_id = public.my_store_id());

-- 書き込みは上の関数経由だけ。テーブルへの直接の書き込み権限は与えない
revoke insert, update, delete, truncate on public.stores, public.products, public.inventories,
  public.inventory_logs, public.staff_members from anon, authenticated;
grant select on public.stores, public.products, public.inventories, public.store_list to anon, authenticated;
grant select on public.inventory_logs, public.staff_members to authenticated;

revoke execute on function public.adjust_inventory(uuid, uuid, integer) from public, anon;
revoke execute on function public.set_inventory(uuid, uuid, integer) from public, anon;
revoke execute on function public.register_product(text, text, text, text) from public, anon;
grant execute on function public.adjust_inventory(uuid, uuid, integer) to authenticated;
grant execute on function public.set_inventory(uuid, uuid, integer) to authenticated;
grant execute on function public.register_product(text, text, text, text) to authenticated;
grant execute on function public.stores_nearby(double precision, double precision, uuid, boolean) to anon, authenticated;
grant execute on function public.is_valid_jan(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- リアルタイム：在庫の変更を利用者の画面へ配信する
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.inventories;
