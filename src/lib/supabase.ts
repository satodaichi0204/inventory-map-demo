import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

// ブラウザで使うクライアント。anon キーなので、できることは RLS とデータベースの関数で制限している。
// 未設定でも画面が落ちないよう、仮の値で作っておき、レイアウトで設定の案内を出す。
export const supabase = createClient(url || "http://localhost:54321", anonKey || "not-configured", {
  auth: { persistSession: true, autoRefreshToken: true },
});
