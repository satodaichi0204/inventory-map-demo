// supabase/seed.sql を生成する。`npm run db:seed:generate`
// 店舗名、商品名、住所はすべて架空。JANコードは店内用の範囲（先頭 20）を使い、実在の商品と重ならないようにしている。
import { writeFileSync } from "node:fs";
import { withCheckDigit } from "../src/lib/jan.ts";
import { normalizeForSearch } from "../src/lib/normalize.ts";

type Store = { id: string; name: string; address: string; hours: string; lat: number; lng: number };

const storeId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const productId = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;

// 座標は実在の駅の周辺。店舗名と番地は架空
const stores: Store[] = [
  {
    id: storeId(1),
    name: "デモマート 丸の内店",
    address: "東京都千代田区丸の内（架空の住所）",
    hours: "7:00〜23:00",
    lat: 35.6797,
    lng: 139.7653,
  },
  {
    id: storeId(2),
    name: "デモマート 新宿西口店",
    address: "東京都新宿区西新宿（架空の住所）",
    hours: "24時間営業",
    lat: 35.6905,
    lng: 139.6981,
  },
  {
    id: storeId(3),
    name: "デモマート 渋谷公園通り店",
    address: "東京都渋谷区宇田川町（架空の住所）",
    hours: "8:00〜24:00",
    lat: 35.6614,
    lng: 139.6997,
  },
  {
    id: storeId(4),
    name: "デモマート 池袋東口店",
    address: "東京都豊島区南池袋（架空の住所）",
    hours: "7:00〜24:00",
    lat: 35.7289,
    lng: 139.7148,
  },
  {
    id: storeId(5),
    name: "デモマート 上野広小路店",
    address: "東京都台東区上野（架空の住所）",
    hours: "7:00〜23:00",
    lat: 35.7085,
    lng: 139.7735,
  },
  {
    id: storeId(6),
    name: "デモマート 品川港南店",
    address: "東京都港区港南（架空の住所）",
    hours: "6:00〜23:00",
    lat: 35.6278,
    lng: 139.7419,
  },
  {
    id: storeId(7),
    name: "デモマート 秋葉原電気街店",
    address: "東京都千代田区外神田（架空の住所）",
    hours: "9:00〜22:00",
    lat: 35.7003,
    lng: 139.7716,
  },
  {
    id: storeId(8),
    name: "デモマート 恵比寿南店",
    address: "東京都渋谷区恵比寿南（架空の住所）",
    hours: "8:00〜23:00",
    lat: 35.6457,
    lng: 139.7093,
  },
];

const products: { name: string; category: string }[] = [
  { name: "やさしい麦茶 600ml", category: "飲料" },
  { name: "すっきり緑茶 525ml", category: "飲料" },
  { name: "ミネラルウォーター 天然水 550ml", category: "飲料" },
  { name: "朝のカフェオレ 280ml", category: "飲料" },
  { name: "はちみつレモンソーダ 500ml", category: "飲料" },
  { name: "サクッと塩チップス", category: "菓子" },
  { name: "ザクザク チョコクッキー", category: "菓子" },
  { name: "もちもち きなこ餅", category: "菓子" },
  { name: "のど飴 ハーブミント", category: "菓子" },
  { name: "限定 ふわふわ抹茶ロール", category: "菓子" },
  { name: "ツナマヨおにぎり", category: "食品" },
  { name: "たまごサンド", category: "食品" },
  { name: "カップ麺 しょうゆ味", category: "食品" },
  { name: "レトルトカレー 中辛", category: "食品" },
  { name: "単3形 アルカリ乾電池 4本", category: "日用品" },
  { name: "USB-C 充電ケーブル 1m", category: "日用品" },
  { name: "ポケットティッシュ 6個パック", category: "日用品" },
  { name: "ビニール傘 65cm", category: "日用品" },
  { name: "マスク ふつうサイズ 7枚", category: "日用品" },
  { name: "ハンドクリーム 無香料 30g", category: "日用品" },
];

// 毎回同じデータになるよう、決まった種から乱数を作る
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261014);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const productRows = products.map((p, i) => {
  const jan = withCheckDigit(`202610${String(i + 1).padStart(6, "0")}`);
  return `  (${q(productId(i + 1))}, ${q(jan)}, ${q(p.name)}, ${q(normalizeForSearch(p.name))}, ${q(p.category)})`;
});

const inventoryRows: string[] = [];
stores.forEach((s, si) => {
  products.forEach((p, pi) => {
    let quantity: number;
    if (p.name.startsWith("限定")) {
      // 見せ場用：在庫のある店舗が少ない商品
      quantity = si === 1 ? 2 : si === 6 ? 5 : 0;
    } else if (p.name.startsWith("ビニール傘")) {
      // 見せ場用：スタッフが担当する新宿店と渋谷店で、残りわずか
      quantity = si === 1 ? 1 : si === 2 ? 2 : randInt(0, 12);
    } else {
      const r = rand();
      if (r < 0.08) return; // 取り扱いなし
      quantity = r < 0.22 ? 0 : r < 0.38 ? randInt(1, 3) : randInt(4, 40);
    }
    const minutesAgo = rand() < 0.5 ? randInt(2, 180) : randInt(180, 60 * 24 * 4);
    inventoryRows.push(
      `  (${q(s.id)}, ${q(productId(pi + 1))}, ${quantity}, now() - interval '${minutesAgo} minutes')`,
    );
  });
});

const sql = `-- デモ用データ。scripts/generate-seed.ts で生成（手で編集しない）
-- 何度実行しても、在庫と更新履歴を初期状態に戻せる。
set search_path = public, extensions;

begin;

insert into public.stores (id, name, address, opening_hours, location) values
${stores
  .map(
    (s) =>
      `  (${q(s.id)}, ${q(s.name)}, ${q(s.address)}, ${q(s.hours)}, st_setsrid(st_makepoint(${s.lng}, ${s.lat}), 4326)::geography)`,
  )
  .join(",\n")}
on conflict (id) do update set
  name = excluded.name,
  address = excluded.address,
  opening_hours = excluded.opening_hours,
  location = excluded.location;

-- 商品と在庫は入れ直す（スタッフが簡易登録した商品も消える）
truncate public.inventory_logs, public.inventories, public.products;

insert into public.products (id, jan_code, name, name_normalized, category) values
${productRows.join(",\n")};

insert into public.inventories (store_id, product_id, quantity, updated_at) values
${inventoryRows.join(",\n")};

commit;
`;

writeFileSync(new URL("../supabase/seed.sql", import.meta.url), sql);
console.log(
  `supabase/seed.sql を生成しました（店舗 ${stores.length}、商品 ${products.length}、在庫 ${inventoryRows.length} 件）`,
);
