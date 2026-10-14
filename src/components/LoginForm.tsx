"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEMO_STAFF_ACCOUNTS } from "@/config";
import { supabase } from "@/lib/supabase";
import { ChevronRightIcon, DemoNote, StoreIcon } from "./ui";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (mail: string, pass: string) => {
    setPending(mail);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: mail, password: pass });
    if (error) {
      setPending(null);
      setError(error.message === "Invalid login credentials" ? "メールアドレスかパスワードが違います" : error.message);
      return;
    }
    router.replace("/staff");
  };

  const inputClass =
    "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-base outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100";

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8 md:py-12">
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
          <StoreIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">スタッフ ログイン</h1>
        <p className="mt-1 text-sm text-slate-500">スマートフォンから、担当店舗の在庫を更新できます</p>
      </div>

      {/* デモ用アカウント */}
      <section className="mt-7">
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] tracking-wider text-amber-800">DEMO</span>
          デモ用アカウントで試す（タップでログイン）
        </h2>
        <ul className="space-y-2">
          {DEMO_STAFF_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => signIn(a.email, a.password)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md disabled:opacity-60"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <StoreIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">{a.displayName}</span>
                  <span className="block truncate text-xs text-slate-500">{a.email}</span>
                  <span className="block text-xs text-slate-400">パスワード：{a.password}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-blue-600">
                  {pending === a.email ? "ログイン中…" : <ChevronRightIcon className="h-5 w-5" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">それぞれ、担当の店舗の在庫だけを更新できます。</p>
      </section>

      <div className="my-7 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        またはメールアドレスで
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          signIn(email, password);
        }}
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
            パスワード
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending !== null}
          className="h-11 w-full rounded-xl bg-blue-600 font-semibold text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-700 disabled:opacity-60"
        >
          {pending === email && email ? "ログイン中…" : "ログイン"}
        </button>
      </form>
      <DemoNote className="mt-6 text-center" />
    </div>
  );
}
