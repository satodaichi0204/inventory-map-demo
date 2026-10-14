// MapLibre の地図処理用ワーカーを public/ にコピーする（predev / prebuild で自動実行）。
// MapLibre 6 は自分のファイルの場所からワーカーを探すが、Next.js がファイルをまとめ直すと見つからなくなるため、
// 決まったURL（/maplibre/maplibre-gl-worker.mjs）で配信し、StoreMap.tsx で setWorkerUrl する。
import { copyFileSync, mkdirSync } from "node:fs";

const from = new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url);
const dir = new URL("../public/maplibre/", import.meta.url);
mkdirSync(dir, { recursive: true });
copyFileSync(from, new URL("maplibre-gl-worker.mjs", dir));
