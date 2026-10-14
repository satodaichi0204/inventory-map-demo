"use client";

import JsBarcode from "jsbarcode";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { withCheckDigit } from "@/lib/jan";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";
import { DemoNote } from "./ui";

/** 未登録の商品の登録を試すための、データにないJANコード */
const UNREGISTERED_JAN = withCheckDigit("202610000099");

function Barcode({ code }: { code: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, code, {
      format: code.length === 8 ? "EAN8" : "EAN13",
      width: 2,
      height: 64,
      fontSize: 15,
      margin: 10,
      background: "#ffffff",
      font: "monospace",
    });
  }, [code]);
  return <svg ref={ref} role="img" aria-label={`JANコード ${code}`} className="h-auto w-full max-w-[240px]" />;
}

const STEPS = [
  { title: "このページをPCに表示", body: "下のバーコードを、パソコンの画面に出しておきます。" },
  {
    title: "スマホでスタッフ画面へ",
    body: "スタッフ画面にログインし、「バーコードを読み取る」でバーコードを写します。",
    link: { href: "/staff/login", label: "スタッフ画面を開く" },
  },
  {
    title: "在庫を増減する",
    body: "＋／− を押すと、別の端末で開いた地図や店舗のページが、再読み込みなしで変わります。",
    link: { href: "/", label: "地図を開く" },
  },
];

export default function BarcodeSheet() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("products")
      .select("id, jan_code, name, category")
      .order("jan_code")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setProducts(data ?? []);
      });
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">デモ用バーコード</h1>
      <p className="mt-1 text-sm text-slate-500">
        商品を手元に用意しなくても、スマートフォンのカメラでの読み取りを試せます。
      </p>

      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">{s.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{s.body}</p>
              {s.link && (
                <Link
                  href={s.link.href}
                  target="_blank"
                  className="mt-1.5 inline-block text-xs font-semibold text-blue-600 hover:underline"
                >
                  {s.link.label} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>

      {error && <p className="mt-6 text-sm text-red-700">読み込めませんでした：{error}</p>}
      {!products && !error && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      )}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {products?.map((p) => (
          <li key={p.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold leading-snug text-slate-900">{p.name}</span>
              {p.category && (
                <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                  {p.category}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-1 items-end justify-center">
              <Barcode code={p.jan_code} />
            </div>
          </li>
        ))}
        {products && (
          <li className="flex flex-col rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
            <span className="text-sm font-semibold text-amber-900">未登録の商品</span>
            <span className="text-xs text-amber-800/80">読み取ると、商品の登録の流れを試せます</span>
            <div className="mt-2 flex flex-1 items-end justify-center">
              <Barcode code={UNREGISTERED_JAN} />
            </div>
          </li>
        )}
      </ul>
      <DemoNote className="mt-8" />
    </div>
  );
}
