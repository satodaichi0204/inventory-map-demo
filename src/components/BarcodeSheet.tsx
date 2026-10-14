"use client";

import JsBarcode from "jsbarcode";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { withCheckDigit } from "@/lib/jan";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";

/** 未登録の商品の登録を試すための、データにないJANコード */
const UNREGISTERED_JAN = withCheckDigit("202610000099");

function Barcode({ code }: { code: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, code, {
      format: code.length === 8 ? "EAN8" : "EAN13",
      width: 2,
      height: 70,
      fontSize: 16,
      margin: 12,
      background: "#ffffff",
    });
  }, [code]);
  return <svg ref={ref} role="img" aria-label={`JANコード ${code}`} className="h-auto w-full max-w-[260px]" />;
}

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
    <div className="mx-auto w-full max-w-5xl p-4">
      <h1 className="text-xl font-bold text-gray-900">デモ用バーコード</h1>
      <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-bold">試し方</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>このページをパソコンの画面に表示します。</li>
          <li>
            スマートフォンで{" "}
            <Link href="/staff/login" className="underline">
              スタッフ画面
            </Link>
            にログインし、「バーコードを読み取る」を押して、下のバーコードを写します。
          </li>
          <li>在庫を増減すると、別の端末で開いた地図や店舗のページの在庫が、再読み込みなしで変わります。</li>
        </ol>
        <p className="mt-1 text-xs">商品名とJANコードはすべてデモ用の架空のものです（先頭が20の、店内用の範囲）。</p>
      </div>

      {error && <p className="mt-4 text-sm text-red-700">読み込めませんでした：{error}</p>}
      {!products && !error && <p className="mt-4 text-sm text-gray-500">読み込み中…</p>}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products?.map((p) => (
          <li key={p.id} className="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-3">
            <div className="self-start text-sm font-medium text-gray-900">{p.name}</div>
            <div className="self-start text-xs text-gray-500">{p.category}</div>
            <Barcode code={p.jan_code} />
          </li>
        ))}
        {products && (
          <li className="flex flex-col items-center rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-3">
            <div className="self-start text-sm font-medium text-amber-900">未登録の商品（登録の流れを試す用）</div>
            <div className="self-start text-xs text-amber-800">読み取ると「未登録の商品です」と表示されます</div>
            <Barcode code={UNREGISTERED_JAN} />
          </li>
        )}
      </ul>
    </div>
  );
}
