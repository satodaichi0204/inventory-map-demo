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
import { StockBadge, Toast, UpdatedAt } from "./ui";

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

  if (status === "loading") return <p className="p-6 text-sm text-gray-500">読み込み中…</p>;
  if (status === "not-staff" || !staff)
    return (
      <div className="p-6 text-sm">
        このアカウントは、どの店舗のスタッフにも登録されていません。
        <button type="button" onClick={logout} className="ml-2 text-blue-700 underline">
          ログアウト
        </button>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500">担当店舗</p>
          <h1 className="text-lg font-bold text-gray-900">{staff.store.name}</h1>
          <p className="text-xs text-gray-500">{staff.display_name} でログイン中</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button type="button" onClick={logout} className="text-sm text-gray-600 underline">
            ログアウト
          </button>
          <Link href={`/stores/${staff.store.id}`} target="_blank" className="text-xs text-blue-700 underline">
            利用者の画面で見る
          </Link>
        </div>
      </header>

      {/* 商品の呼び出し */}
      <section className="space-y-3 rounded-xl border border-gray-200 p-4">
        {scanning ? (
          <BarcodeScanner onDetected={openProduct} onClose={() => setScanning(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-700"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8" />
            </svg>
            バーコードを読み取る
          </button>
        )}

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
            placeholder="JANコードを入力"
            aria-label="JANコードを入力"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base"
          />
          <button type="submit" className="rounded-lg border border-gray-300 px-4 text-sm font-medium hover:bg-gray-50">
            呼び出す
          </button>
        </form>

        <select
          value=""
          onChange={(e) => e.target.value && openProduct(e.target.value)}
          aria-label="一覧から商品を選ぶ"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
        >
          <option value="">一覧から選ぶ（カメラがない端末用）</option>
          {products.map((p) => (
            <option key={p.id} value={p.jan_code}>
              {p.category ? `［${p.category}］` : ""}
              {p.name}
            </option>
          ))}
        </select>

        {lookupError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {lookupError}
          </p>
        )}
      </section>

      {/* 読み取った商品と在庫の更新 */}
      {product && (
        <section className="space-y-4 rounded-xl border-2 border-blue-200 bg-blue-50/40 p-4">
          <div>
            <p className="text-xs text-gray-500">JAN {product.jan_code}</p>
            <h2 className="text-lg font-bold text-gray-900">{product.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StockBadge quantity={inventory?.quantity ?? 0} mode="exact" />
              <UpdatedAt at={inventory?.updated_at} now={now} />
            </div>
          </div>

          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              disabled={busy || (inventory?.quantity ?? 0) <= 0}
              onClick={() => change({ type: "adjust", delta: -1 })}
              className="h-16 w-20 rounded-xl bg-white text-2xl font-bold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-40"
              aria-label="1個減らす"
            >
              −1
            </button>
            <div className="w-20 text-center">
              <div className="text-4xl font-bold tabular-nums text-gray-900">{inventory?.quantity ?? 0}</div>
              <div className="text-xs text-gray-500">個</div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => change({ type: "adjust", delta: 1 })}
              className="h-16 w-20 rounded-xl bg-blue-600 text-2xl font-bold text-white hover:bg-blue-700 disabled:opacity-40"
              aria-label="1個増やす"
            >
              ＋1
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              change({ type: "set", quantity: Number(stocktake) });
            }}
            className="flex items-center gap-2"
          >
            <label htmlFor="stocktake" className="shrink-0 text-sm text-gray-700">
              棚卸し（数を直接入力）
            </label>
            <input
              id="stocktake"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={stocktake}
              onChange={(e) => setStocktake(e.target.value)}
              className="w-24 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-base"
            />
            <button
              type="submit"
              disabled={busy || stocktake === "" || Number(stocktake) === (inventory?.quantity ?? 0)}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              上書き
            </button>
          </form>
        </section>
      )}

      {/* 未登録の商品 */}
      {unknownCode && (
        <section className="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div>
            <p className="font-bold text-amber-900">未登録の商品です</p>
            <p className="text-sm text-amber-900">JAN {unknownCode}。商品名を入れると、その場で登録できます。</p>
          </div>
          <form onSubmit={register} className="space-y-2">
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="商品名（例：デモ用 新商品）"
              aria-label="商品名"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
            />
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="カテゴリ（任意）"
              aria-label="カテゴリ"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-amber-600 py-2.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              登録する
            </button>
          </form>
        </section>
      )}

      {/* 更新履歴 */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-gray-900">この店舗の更新履歴（新しい順）</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-500">まだ更新はありません</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
            {logs.map((log) => (
              <li key={log.id} className="px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-900">{log.product?.name ?? "（削除された商品）"}</span>
                  <span className="shrink-0 tabular-nums text-gray-900">
                    {log.before_quantity} → <b>{log.after_quantity}</b>
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {CHANGE_LABEL[log.change_type]}・{(log.changed_by && members[log.changed_by]) || "不明なスタッフ"}・
                  {formatRelative(log.changed_at, now)}（{formatAbsolute(log.changed_at)}）
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Toast message={toast} />
    </div>
  );
}
