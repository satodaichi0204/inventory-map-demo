// データベース（マイグレーション、シード、RLS、在庫の関数）のテスト。`npm run test:db`
// PostGIS 入りの PGlite（WebAssembly 版 PostgreSQL）に、Supabase の auth スキーマとロールをまねた環境を作って検証する。
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";

const root = new URL("..", import.meta.url);
const migration = readdirSync(new URL("supabase/migrations/", root))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(`supabase/migrations/${f}`, root), "utf8"))
  .join("\n");
const seed = readFileSync(new URL("supabase/seed.sql", root), "utf8");

const pg = new PGlite({ extensions: { postgis } });
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};
const expectError = async (sql, pattern, msg) => {
  try {
    await pg.exec(sql);
    ok(false, `${msg}（エラーにならなかった）`);
  } catch (e) {
    ok(pattern.test(e.message), `${msg} → ${e.message}`);
  }
};

// --- Supabase の環境を最低限まねる ---
await pg.exec(`
  create schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth, extensions to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Supabase は public に作ったものへ、既定で anon / authenticated の全権限を与える
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  create publication supabase_realtime;
`);

await pg.exec(migration);
ok(true, "マイグレーションを適用できた");
await pg.exec(seed);
ok(true, "シードを投入できた");

const one = async (sql, params) => (await pg.query(sql, params)).rows[0];
ok((await one("select count(*)::int n from stores")).n === 8, "店舗が8件");
ok((await one("select count(*)::int n from products")).n === 20, "商品が20件");
ok((await one("select count(*)::int n from inventories")).n === 145, "在庫が145件");
ok(
  (
    await one(
      "select count(*)::int n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'inventories'",
    )
  ).n === 1,
  "inventories がリアルタイムの対象",
);

// --- スタッフ ---
const SHINJUKU = "00000000-0000-4000-8000-000000000002";
const SHIBUYA = "00000000-0000-4000-8000-000000000003";
const P1 = "00000000-0000-4000-9000-000000000001";
const P10 = "00000000-0000-4000-9000-000000000010"; // 限定 ふわふわ抹茶ロール
const u1 = (await one("insert into auth.users (email) values ('s1@x') returning id")).id;
const u2 = (await one("insert into auth.users (email) values ('s2@x') returning id")).id;
await pg.query("insert into staff_members values ($1, $2, '新宿'), ($3, $4, '渋谷')", [u1, SHINJUKU, u2, SHIBUYA]);

const asUser = (uid) => pg.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${uid}';`);
const asAnon = () => pg.exec(`reset role; set role anon; set request.jwt.claim.sub = '';`);
const asAdmin = () => pg.exec(`reset role; set request.jwt.claim.sub = '';`);

// --- 利用者（anon） ---
await asAnon();
ok((await one("select count(*)::int n from inventories")).n === 145, "anon は在庫を読める");
ok((await one("select count(*)::int n from store_list")).n === 8, "anon は store_list を読める");
const lat = await one("select lat, lng from store_list where id = $1", [SHINJUKU]);
ok(Math.abs(lat.lat - 35.6905) < 1e-9 && Math.abs(lat.lng - 139.6981) < 1e-9, "store_list の緯度経度が正しい");
ok((await one("select count(*)::int n from inventory_logs")).n === 0, "anon は更新履歴を読めない（0件に見える）");
await expectError(
  `insert into inventories values ('${SHINJUKU}', '${P1}', 1)`,
  /permission denied/,
  "anon は在庫に直接書けない",
);
await expectError(`update inventories set quantity = 99`, /permission denied/, "anon は在庫を直接更新できない");
await expectError(
  `select adjust_inventory('${SHINJUKU}', '${P1}', 1)`,
  /permission denied/,
  "anon は在庫の関数を呼べない",
);

const near = (await pg.query("select * from stores_nearby(35.6812, 139.7671, $1)", [P10])).rows;
ok(
  near.length === 8 && near[0].name.includes("丸の内"),
  `近い順：先頭は丸の内店（${near[0].name}, ${Math.round(near[0].distance_m)}m）`,
);
ok(
  near.every((r, i) => i === 0 || near[i - 1].distance_m <= r.distance_m),
  "距離の昇順に並ぶ",
);
const inStock = (await pg.query("select * from stores_nearby(35.6812, 139.7671, $1, true)", [P10])).rows;
ok(inStock.length === 2, `在庫ありだけ：限定商品は2店舗（${inStock.map((r) => r.name).join("、")}）`);
const shinjukuDist = near.find((r) => r.id === SHINJUKU).distance_m;
ok(shinjukuDist > 6000 && shinjukuDist < 7000, `東京駅〜新宿西口店の距離がそれらしい（${Math.round(shinjukuDist)}m）`);

// --- スタッフ（新宿） ---
await asUser(u1);
const before =
  (await one("select quantity from inventories where store_id = $1 and product_id = $2", [SHINJUKU, P1]))?.quantity ??
  0;
const r1 = await one("select * from adjust_inventory($1, $2, 1)", [SHINJUKU, P1]);
ok(r1.quantity === before + 1 && r1.updated_by === u1, `+1 で ${before} → ${r1.quantity}`);
const r2 = await one("select * from set_inventory($1, $2, 10)", [SHINJUKU, P1]);
ok(r2.quantity === 10, "棚卸しで10に上書き");
const r3 = await one("select * from adjust_inventory($1, $2, -1)", [SHINJUKU, P1]);
ok(r3.quantity === 9, "-1 で 9");
await expectError(`select adjust_inventory('${SHINJUKU}', '${P1}', -100)`, /0未満/, "0未満になる減少は拒否");
await expectError(`select set_inventory('${SHINJUKU}', '${P1}', -1)`, /0以上/, "負の棚卸しは拒否");
await expectError(`select adjust_inventory('${SHINJUKU}', '${P1}', 0)`, /増減する数/, "増減0は拒否");
await expectError(
  `select adjust_inventory('${SHIBUYA}', '${P1}', 1)`,
  /権限がありません/,
  "担当外の店舗は更新できない",
);
ok(
  (await one("select quantity from inventories where store_id = $1 and product_id = $2", [SHINJUKU, P1])).quantity ===
    9,
  "拒否された更新は反映されていない",
);

const logs = (await pg.query("select * from inventory_logs order by id")).rows;
ok(
  logs.length === 3,
  `履歴は3件（${logs.map((l) => `${l.change_type}:${l.before_quantity}→${l.after_quantity}`).join(", ")}）`,
);
ok(logs.map((l) => l.change_type).join() === "increase,stocktake,decrease", "履歴の種類が正しい");
await expectError(
  `insert into inventory_logs (store_id, product_id, before_quantity, after_quantity, change_type) values ('${SHINJUKU}', '${P1}', 0, 1, 'increase')`,
  /permission denied/,
  "スタッフも履歴を直接書けない",
);
ok((await one("select count(*)::int n from staff_members")).n === 1, "スタッフ一覧は自分の店舗の分だけ見える");

// 在庫の行がない商品にも、関数で在庫を作れる
const missing = await one(
  "select p.id from products p where not exists (select 1 from inventories i where i.product_id = p.id and i.store_id = $1) limit 1",
  [SHINJUKU],
);
if (missing) {
  const r = await one("select * from adjust_inventory($1, $2, 3)", [SHINJUKU, missing.id]);
  ok(r.quantity === 3, "取り扱いのなかった商品にも +3 で在庫を作れる");
} else {
  ok(true, "（新宿店はすべての商品に在庫の行がある）");
}

// 商品の簡易登録
const newProduct = await one("select * from register_product('2026100000991', 'デモ 新商品', 'でも新商品', null)");
ok(newProduct.jan_code === "2026100000991", "未登録のJANコードを登録できる");
await expectError(
  `select register_product('2026100000990', 'x', 'x', null)`,
  /JANコードが正しくありません/,
  "チェックディジットが違うJANは登録できない",
);
await expectError(
  `select register_product('2026100000991', 'x', 'x', null)`,
  /duplicate key|unique/,
  "同じJANは二重に登録できない",
);

// --- スタッフ（渋谷）からは新宿の履歴が見えない ---
await asUser(u2);
ok((await one("select count(*)::int n from inventory_logs")).n === 0, "他店のスタッフには履歴が見えない");

// --- JANの検証が、JS と SQL で一致する ---
await asAdmin();
const { isValidJan } = await import(new URL("src/lib/jan.ts", root).href);
let mismatch = 0;
for (let i = 0; i < 3000; i++) {
  const len = i % 3 === 0 ? 8 : 13;
  const code = Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join("");
  const sql = (await one("select is_valid_jan($1) v", [code])).v;
  if (sql !== isValidJan(code)) mismatch++;
}
ok(mismatch === 0, "JANの検証が、JS と SQL で3000件すべて一致");

// --- シードは何度でも流せる（スタッフは残る） ---
await pg.exec(seed);
ok((await one("select count(*)::int n from inventory_logs")).n === 0, "シードの再実行で履歴が消える");
ok((await one("select count(*)::int n from staff_members")).n === 2, "シードの再実行でもスタッフは残る");
ok((await one("select count(*)::int n from products")).n === 20, "シードの再実行で、簡易登録した商品も初期状態に戻る");

console.log(failures === 0 ? "\nすべて成功" : `\n失敗 ${failures} 件`);
process.exit(failures ? 1 : 0);
