// Supabase にスキーマとデモ用データを入れ、デモ用のスタッフアカウントを作る。
//   npm run db:setup   … 初回（スキーマ + デモ用データ + スタッフ）
//   npm run db:reset   … デモ用データだけを初期状態に戻す
// 必要な環境変数（.env.local）：SUPABASE_DB_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { DEMO_STAFF_ACCOUNTS } from "../src/config.ts";

const seedOnly = process.argv.includes("--seed-only");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`環境変数 ${name} がありません。.env.local を確認してください（.env.example を参照）`);
    process.exit(1);
  }
  return value;
}

const db = new pg.Client({
  connectionString: requireEnv("SUPABASE_DB_URL"),
  ssl: { rejectUnauthorized: false },
});
await db.connect();

try {
  if (!seedOnly) {
    const { rows } = await db.query("select to_regclass('public.stores') is not null as exists");
    if (rows[0].exists) {
      console.log("スキーマは作成済みのため、マイグレーションを飛ばします");
    } else {
      const dir = new URL("../supabase/migrations/", import.meta.url);
      for (const file of readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .sort()) {
        console.log(`マイグレーションを適用: ${file}`);
        await db.query(readFileSync(new URL(file, dir), "utf8"));
      }
    }
  }

  console.log("デモ用データを投入: supabase/seed.sql");
  await db.query(readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8"));

  if (!seedOnly) {
    const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const account of DEMO_STAFF_ACCOUNTS) {
      const { rows } = await db.query("select id from auth.users where email = $1", [account.email]);
      let userId: string | undefined = rows[0]?.id;
      if (!userId) {
        const { data, error } = await admin.auth.admin.createUser({
          email: account.email,
          password: account.password,
          email_confirm: true,
        });
        if (error) throw error;
        userId = data.user.id;
        console.log(`スタッフを作成: ${account.email}`);
      } else {
        console.log(`スタッフは作成済み: ${account.email}`);
      }
      await db.query(
        `insert into public.staff_members (user_id, store_id, display_name) values ($1, $2, $3)
         on conflict (user_id) do update set store_id = excluded.store_id, display_name = excluded.display_name`,
        [userId, account.storeId, account.displayName],
      );
    }
  }

  console.log("完了しました");
} finally {
  await db.end();
}
