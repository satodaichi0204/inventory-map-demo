"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEMO_STAFF_ACCOUNTS } from "@/config";
import { supabase } from "@/lib/supabase";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "メールアドレスかパスワードが違います" : error.message);
      return;
    }
    router.replace("/staff");
  };

  return (
    <div className="mx-auto w-full max-w-md p-4">
      <h1 className="text-xl font-bold text-gray-900">スタッフ ログイン</h1>
      <p className="mt-1 text-sm text-gray-600">店舗スタッフが、スマートフォンから在庫を更新する画面です。</p>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            パスワード
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "ログイン中…" : "ログイン"}
        </button>
      </form>

      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p className="text-sm font-bold text-amber-900">デモ用のアカウント</p>
        <p className="mt-0.5 text-xs text-amber-900">押すと入力欄に入ります。それぞれ担当の店舗だけを更新できます。</p>
        <ul className="mt-2 space-y-2">
          {DEMO_STAFF_ACCOUNTS.map((a) => (
            <li key={a.email} className="rounded-md bg-white p-2 text-xs text-gray-700 ring-1 ring-amber-200">
              <div className="font-semibold text-gray-900">{a.displayName}</div>
              <div className="break-all">{a.email}</div>
              <div>パスワード：{a.password}</div>
              <button
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(a.password);
                }}
                className="mt-1.5 rounded border border-gray-300 px-2 py-0.5 text-xs font-medium hover:bg-gray-50"
              >
                この内容を入力
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
