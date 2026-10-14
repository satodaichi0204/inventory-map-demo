"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useNow } from "@/lib/hooks";
import { isValidJan } from "@/lib/jan";
import { normalizeForSearch } from "@/lib/normalize";
import { applyInventoryChange, type InventoryChange } from "@/lib/stock";
import { supabase } from "@/lib/supabase";
import { formatAbsolute, formatRelative } from "@/lib/time";
import type { InventoryRow, Product } from "@/lib/types";
import { BoxIcon, ChevronRightIcon, DemoNote, LogoutIcon, ScanIcon, StockBadge, Toast, UpdatedAt } from "./ui";

const BarcodeScanner = dynamic(() => import("./BarcodeScanner"), { ssr: false });

type Staff = { user_id: string; display_name: string; store: { id: string; name: string } };
type Log = {
  id: number;
  before_quantity: number;
  after_quantity: number;
  change_type: "increase" | "decrease" | "stocktake";
  changed_by: string | null;
  changed_at: string;
  product: { name: string } | null;
};

const CHANGE_LABEL = { increase: "入荷", decrease: "販売・減少", stocktake: "棚卸し" } as const;
const CHANGE_STYLE = {
  increase: "bg-emerald-50 text-emerald-700",
  decrease: "bg-rose-50 text-rose-700",
  stocktake: "bg-slate-100 text-slate-700",
} as const;

export default function StaffConsole() {
  const router = useRouter();
  const now = useNow();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [members, setMembers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "not-staff">("loading");
  const [products, setProducts] = useState<Product[]>([]);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [inventory, setInventory] = useState<InventoryRow | null>(null);
  const [stocktake, setStocktake] = useState("");
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const loadLogs = useCallback(async (storeId: string) => {
    const { data } = await supabase
      .from("inventory_logs")
      .select("id, before_quantity, after_quantity, change_type, changed_by, changed_at, product:products(name)")
      .eq("store_id", storeId)
      .order("changed_at", { ascending: false })
      .limit(15);
    setLogs((data as unknown as Log[]) ?? []);
  }, []);

  // ログインと担当店舗の確認
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/staff/login");
        return;
      }
      const { data } = await supabase
        .from("staff_members")
        .select("user_id, display_name, store:stores(id, name)")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (!data) {
        setStatus("not-staff");
        return;
      }
      const me = data as unknown as Staff;
      setStaff(me);
      setStatus("ready");
      const [{ data: memberRows }, { data: productRows }] = await Promise.all([
        supabase.from("staff_members").select("user_id, display_name").eq("store_id", me.store.id),
        supabase.from("products").select("id, jan_code, name, category").order("category").order("name"),
      ]);
      setMembers(Object.fromEntries((memberRows ?? []).map((m) => [m.user_id, m.display_name])));
      setProducts(productRows ?? []);
      await loadLogs(me.store.id);
    })();
  }, [router, loadLogs]);

  const openProduct = useCallback(
    async (code: string) => {
      if (!staff) return;
      setScanning(false);
      setLookupError(null);
      setUnknownCode(null);
      setProduct(null);
      setInventory(null);
      if (!isValidJan(code)) {
        setLookupError(
          `「${code}」はJANコードとして正しくありません（8桁か13桁で、チェックディジットが合う必要があります）`,
        );
        return;
      }
      const { data: found, error } = await supabase
        .from("products")
        .select("id, jan_code, name, category")
        .eq("jan_code", code)
        .maybeSingle();
      if (error) {
        setLookupError(error.message);
        return;
      }
      if (!found) {
        setUnknownCode(code);
        return;
      }
      const { data: inv } = await supabase
        .from("inventories")
        .select("*")
        .eq("store_id", staff.store.id)
        .eq("product_id", found.id)
        .maybeSingle();
      setProduct(found);
      setInventory(inv);
      setStocktake(String(inv?.quantity ?? 0));
    },
    [staff],
  );

  const change = async (c: InventoryChange) => {
    if (!staff || !product) return;
    const current = inventory?.quantity ?? 0;
    let after: number;
    try {
      after = applyInventoryChange(current, c).after;
    } catch (e) {
      showToast((e as Error).message);
      return;
    }
    setBusy(true);
    const { data, error } =
      c.type === "adjust"
        ? await supabase.rpc("adjust_inventory", {
            p_store_id: staff.store.id,
            p_product_id: product.id,
            p_delta: c.delta,
          })
        : await supabase.rpc("set_inventory", {
            p_store_id: staff.store.id,
            p_product_id: product.id,
            p_quantity: c.quantity,
          });
    setBusy(false);
    if (error) {
      showToast(`更新できませんでした：${error.message}`);
      return;
    }
    const row = data as InventoryRow;
    setInventory(row);
    setStocktake(String(row.quantity));
    showToast(`在庫を ${current} → ${after} 個に更新しました`);
    loadLogs(staff.store.id);
  };

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unknownCode) return;
    setBusy(true);
    const { error } = await supabase.rpc("register_product", {
      p_jan_code: unknownCode,
      p_name: newName,
      p_name_normalized: normalizeForSearch(newName),
      p_category: newCategory || null,
    });
    setBusy(false);
    if (error) {
      showToast(
        error.code === "23505" ? "このJANコードはすでに登録されています" : `登録できませんでした：${error.message}`,
      );
      return;
    }
    showToast("商品を登録しました。続けて在庫数を入れてください");
    setNewName("");
    setNewCategory("");
    const { data } = await supabase
      .from("products")
      .select("id, jan_code, name, category")
      .order("category")
      .order("name");
    setProducts(data ?? []);
    openProduct(unknownCode);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/staff/login");
  };

  if (status === "loading")
    return (
      <div className="mx-auto w-full max-w-xl space-y-4 p-4">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    );
  if (status === "not-staff" || !staff)
    return (
      <div className="p-6 text-sm">
        このアカウントは、どの店舗のスタッフにも登録されていません。
        <button type="button" onClick={logout} className="ml-2 text-blue-700 underline">
          ログアウト
        </button>
      </div>
    );

  const quantity = inventory?.quantity ?? 0;
  const inputClass =
    "h-11 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-base outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100";

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4 md:py-6">
      {/* 担当店舗 */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-lg">
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-blue-500/20" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-400">担当店舗</p>
            <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight">{staff.store.name}</h1>
            <p className="mt-1 text-xs text-slate-400">{staff.display_name} でログイン中</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/20"
          >
            <LogoutIcon className="h-4 w-4" />
            ログアウト
          </button>
        </div>
        <Link
          href={`/stores/${staff.store.id}`}
          target="_blank"
          className="relative mt-3 inline-block text-xs font-medium text-blue-300 underline-offset-2 hover:underline"
        >
          利用者の画面で、この店舗の在庫を見る →
        </Link>
      </header>

      {/* 商品の呼び出し */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {scanning ? (
          <BarcodeScanner onDetected={openProduct} onClose={() => setScanning(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue-600 py-4 text-lg font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-[0.99]"
          >
            <ScanIcon className="h-6 w-6" />
            バーコードを読み取る
          </button>
        )}

        <details className="group rounded-xl bg-slate-50 px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-slate-600 [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="h-4 w-4 transition group-open:rotate-90" />
            カメラが使えないとき（コード入力・一覧から選ぶ）
          </summary>
          <div className="mt-3 space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                openProduct(manualCode.trim());
              }}
              className="flex gap-2"
            >
              <input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="JANコード（8桁か13桁）"
                aria-label="JANコードを入力"
                className={`${inputClass} flex-1 bg-white font-mono`}
              />
              <button
                type="submit"
                className="rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                呼び出す
              </button>
            </form>
            <select
              value=""
              onChange={(e) => e.target.value && openProduct(e.target.value)}
              aria-label="一覧から商品を選ぶ"
              className={`${inputClass} w-full bg-white text-sm text-slate-700`}
            >
              <option value="">一覧から商品を選ぶ</option>
              {products.map((p) => (
                <option key={p.id} value={p.jan_code}>
                  {p.category ? `［${p.category}］` : ""}
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </details>

        {lookupError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {lookupError}
          </p>
        )}
      </section>

      {/* 読み取った商品と在庫の更新 */}
      {product && (
        <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-md shadow-blue-900/5">
          <div className="flex items-start gap-3 border-b border-slate-100 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <BoxIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold leading-snug text-slate-900">{product.name}</h2>
              <p className="font-mono text-xs text-slate-400">JAN {product.jan_code}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StockBadge quantity={quantity} mode="exact" />
                <UpdatedAt at={inventory?.updated_at} now={now} compact />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 px-4 py-6">
            <button
              type="button"
              disabled={busy || quantity <= 0}
              onClick={() => change({ type: "adjust", delta: -1 })}
              className="grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-3xl font-bold text-slate-700 transition hover:bg-slate-200 active:scale-95 disabled:opacity-30"
              aria-label="1個減らす"
            >
              −
            </button>
            <div className="w-28 text-center">
              <div className="text-5xl font-bold tabular-nums tracking-tight text-slate-900">{quantity}</div>
              <div className="mt-1 text-xs font-medium text-slate-400">現在の在庫（個）</div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => change({ type: "adjust", delta: 1 })}
              className="grid h-16 w-16 place-items-center rounded-full bg-blue-600 text-3xl font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-95 disabled:opacity-30"
              aria-label="1個増やす"
            >
              ＋
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              change({ type: "set", quantity: Number(stocktake) });
            }}
            className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3"
          >
            <label htmlFor="stocktake" className="shrink-0 text-sm font-medium text-slate-600">
              棚卸し
            </label>
            <input
              id="stocktake"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={stocktake}
              onChange={(e) => setStocktake(e.target.value)}
              className={`${inputClass} w-20 flex-1 bg-white text-right tabular-nums`}
            />
            <span className="shrink-0 text-sm text-slate-500">個に</span>
            <button
              type="submit"
              disabled={busy || stocktake === "" || Number(stocktake) === quantity}
              className="h-11 shrink-0 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-30"
            >
              上書き
            </button>
          </form>
        </section>
      )}

      {/* 未登録の商品 */}
      {unknownCode && (
        <section className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div>
            <p className="font-bold text-amber-900">未登録の商品です</p>
            <p className="text-sm text-amber-900/80">
              JAN <span className="font-mono">{unknownCode}</span>。商品名を入れると、その場で登録できます。
            </p>
          </div>
          <form onSubmit={register} className="space-y-2">
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="商品名（例：デモ用 新商品）"
              aria-label="商品名"
              className={`${inputClass} w-full bg-white`}
            />
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="カテゴリ（任意）"
              aria-label="カテゴリ"
              className={`${inputClass} w-full bg-white`}
            />
            <button
              type="submit"
              disabled={busy}
              className="h-11 w-full rounded-xl bg-amber-600 font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
            >
              登録する
            </button>
          </form>
        </section>
      )}

      {/* 更新履歴 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">更新履歴</h2>
        <p className="text-xs text-slate-500">この店舗の在庫の変更（新しい順）</p>
        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">まだ更新はありません</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={`w-16 shrink-0 rounded-md py-0.5 text-center text-[11px] font-semibold ${CHANGE_STYLE[log.change_type]}`}
                >
                  {CHANGE_LABEL[log.change_type]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">
                    {log.product?.name ?? "（削除された商品）"}
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {(log.changed_by && members[log.changed_by]) || "不明なスタッフ"}・
                    {formatRelative(log.changed_at, now)}（{formatAbsolute(log.changed_at)}）
                  </div>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-slate-400">
                  {log.before_quantity} → <b className="text-slate-900">{log.after_quantity}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DemoNote className="text-center" />
      <Toast message={toast} />
    </div>
  );
}
