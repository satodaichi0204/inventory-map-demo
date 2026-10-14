// デモの設定。依頼者の方針が決まったら、ここだけ変えれば全画面に反映される。

/**
 * 利用者向け画面の在庫の見せ方
 * - "exact": 「在庫あり（12個）」のように正確な数を出す
 * - "level": 「在庫あり」「残りわずか」「在庫なし」の段階だけを出す
 * 環境変数 NEXT_PUBLIC_STOCK_DISPLAY_MODE で上書きできる。
 */
export type StockDisplayMode = "exact" | "level";
export const STOCK_DISPLAY_MODE: StockDisplayMode =
  process.env.NEXT_PUBLIC_STOCK_DISPLAY_MODE === "level" ? "level" : "exact";

/** この数以下（1以上）を「残りわずか」とする */
export const LOW_STOCK_THRESHOLD = 3;

/** 現在地を使えないときの地図の中心（東京駅） */
export const DEFAULT_CENTER = { lat: 35.6812, lng: 139.7671 };
export const DEFAULT_ZOOM = 11;

/** APIキー不要の無料の地図（OpenFreeMap） */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** デモ用のスタッフアカウント（ログイン画面に表示する。scripts/db-setup.ts でも使う） */
export const DEMO_STAFF_ACCOUNTS = [
  {
    email: "staff-shinjuku@demo.example.com",
    password: "demo-shinjuku-2026",
    displayName: "新宿店 デモスタッフ",
    storeId: "00000000-0000-4000-8000-000000000002",
  },
  {
    email: "staff-shibuya@demo.example.com",
    password: "demo-shibuya-2026",
    displayName: "渋谷店 デモスタッフ",
    storeId: "00000000-0000-4000-8000-000000000003",
  },
] as const;
