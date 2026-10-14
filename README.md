# 在庫マップ（デモ版）

地図から、商品の在庫がある近くの店舗を探せるサービスのデモ版です。
店舗スタッフはスマートフォンのカメラでJANコードを読み取って在庫を更新し、その変更は利用者の画面に**再読み込みなしで**すぐ反映されます。

> 店舗名、住所、商品名、JANコードはすべて架空のものです。

## できること

| 画面 | URL | 内容 |
|---|---|---|
| 地図（利用者） | `/` | 店舗を地図に表示。商品名（表記ゆれに対応）かJANコードで検索すると、在庫のある店舗を色付きで強調し、近い順に一覧表示 |
| 店舗の詳細 | `/stores/[id]` | 住所、営業時間、地図、商品ごとの在庫数と最終更新日時 |
| スタッフ ログイン | `/staff/login` | デモ用アカウントを画面に表示 |
| 在庫の更新 | `/staff` | カメラでJANコードを読み取り、+1 / −1 / 棚卸し（数の上書き）。未登録の商品は、その場で登録。更新履歴の表示 |
| デモ用バーコード | `/demo/barcodes` | PCに表示して、スマートフォンのカメラで読み取って試すためのページ |

在庫の見せ方（正確な数か、「在庫あり／残りわずか／在庫なし」の段階表示か）は [src/config.ts](src/config.ts) の1か所で切り替えられます（デモでは画面からも切り替え可能）。

## 技術構成

- **Next.js**（App Router、TypeScript strict）＋ **Tailwind CSS**
- **Supabase**：PostgreSQL ＋ PostGIS（近い順の検索）、Auth（スタッフのログイン）、Realtime（在庫の即時反映）
- **MapLibre GL JS ＋ OpenFreeMap**：APIキー不要の無料の地図
- **ZXing**（`@zxing/browser`）：iPhone の Safari でも動くバーコード読み取り
- **JsBarcode**：デモ用バーコードの表示
- **Vercel**：ホスティング

### セキュリティの考え方

- ブラウザに渡すのは Supabase の anon キーだけです。できることは、データベースの **Row Level Security** と関数で制限しています。
- 在庫の更新は、データベースの関数 `adjust_inventory` / `set_inventory` 経由だけです。関数の中で「呼び出した人が、その店舗の担当スタッフか」を確かめ、行ロックをとって更新と履歴の記録を1回の処理で行います（2人が同時に更新しても数が狂いません）。
- テーブルへの直接の書き込み権限は、利用者にもスタッフにも与えていません。

## ディレクトリ

```
supabase/migrations/   データベースの定義（テーブル、RLS、関数、リアルタイム）
supabase/seed.sql      デモ用データ（scripts/generate-seed.mts で生成）
scripts/db-setup.mts   スキーマ、デモ用データ、スタッフアカウントを Supabase に入れる
scripts/test-db.mts    データベースのテスト（PostGIS 入りの PGlite で実行）
src/app/               画面（ルーティング）
src/components/        画面の部品（地図、バーコード読み取り、スタッフ画面など）
src/lib/               JANコードの検証、検索の正規化、在庫の規則、日時の表示
src/config.ts          表示の設定、デモ用アカウント
```

## ローカルでの起動

Node.js 22 以上が必要です。

```bash
npm install
cp .env.example .env.local   # 値を入れる（下の「Supabase の準備」）
npm run db:setup             # 初回だけ。スキーマ、デモ用データ、スタッフを作る
npm run dev                  # http://localhost:3000
```

> スマートフォンのカメラは、HTTPS のページでしか使えません。カメラでの読み取りは、Vercel に公開したURL（https）で試してください。PCでは、スタッフ画面の「JANコードを入力」か「一覧から選ぶ」で試せます。

## Supabase の準備

1. [Supabase](https://supabase.com/) で新しいプロジェクトを作る（無料プラン、リージョンは Tokyo）。データベースのパスワードを控えておく。
2. `.env.local` に次の値を入れる。
   - `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`：Project Settings → API（Data API）
   - `SUPABASE_SERVICE_ROLE_KEY`：同じ画面の service_role キー（**ブラウザに出さない。`NEXT_PUBLIC_` を付けない。Vercel にも入れない**）
   - `SUPABASE_DB_URL`：画面上部の Connect → Connection string → **Session pooler** の文字列。`[YOUR-PASSWORD]` をパスワードに置き換える
3. `npm run db:setup` を実行する。

`npm run db:setup` を使わない場合は、SQL Editor で `supabase/migrations/*.sql` → `supabase/seed.sql` の順に実行し、Authentication でスタッフのユーザーを作って `staff_members` に行を追加してください。

デモ用データを初期状態に戻すときは `npm run db:reset`（スタッフのアカウントは残ります）。

## Vercel へのデプロイ

1. このリポジトリを GitHub に push する。
2. Vercel で Add New → Project → リポジトリを選ぶ。
3. Environment Variables に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` の2つだけを入れて Deploy。

以降は、push するたびに自動でデプロイされます。

## テスト

```bash
npm test          # JANコードの検証、検索の正規化、在庫の増減の規則、日時の表示（Vitest）
npm run test:db   # マイグレーション、シード、RLS、在庫の関数、近い順の検索（PGlite ＋ PostGIS）
npm run lint
```

## デモの試し方

1. PCで `/demo/barcodes` を開く。
2. 別の端末（または別のタブ）で `/` を開き、「ビニール傘」などを検索する。
3. スマートフォンで `/staff/login` からデモ用アカウントでログインし、「バーコードを読み取る」で PC 画面のバーコードを写す。
4. +1 / −1 を押すと、2. の地図の在庫と色が、再読み込みなしで変わります。

## 注意

- Supabase の無料プランは、一定期間使われないとプロジェクトが一時停止します。
- Vercel の無料プラン（Hobby）は、個人の非商用利用が前提です。
