"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDisplayMode, useFlash, useNow } from "@/lib/hooks";
import { STOCK_COLORS } from "@/lib/stock";
import { supabase } from "@/lib/supabase";
import type { InventoryRow, Product, StoreInfo } from "@/lib/types";
import { DisplayModeToggle, LiveIndicator, StockBadge, UpdatedAt } from "./ui";

const StoreMap = dynamic(() => import("./StoreMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-gray-100" />,
});

type Item = { product: Product; quantity: number; updated_at: string };

async function fetchItems(storeId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from("inventories")
    .select("quantity, updated_at, product:products!inner(id, jan_code, name, category)")
    .eq("store_id", storeId);
  if (error) throw error;
  return (data as unknown as Item[]) ?? [];
}

export default function StoreDetail() {
  const { id } = useParams<{ id: string }>();
  const [mode, setMode] = useDisplayMode();
  const now = useNow();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [flashing, flash] = useFlash();
  const itemsRef = useRef<Item[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    Promise.all([supabase.from("store_list").select("*").eq("id", id).maybeSingle(), fetchItems(id)])
      .then(([{ data, error }, list]) => {
        if (error) throw error;
        setStore(data as StoreInfo | null);
        setItems(list);
      })
      .catch((e: Error) => setError(`読み込めませんでした：${e.message}`))
      .finally(() => setLoading(false));
  }, [id]);

  // この店舗の在庫の変更だけを受け取る
  useEffect(() => {
    const channel = supabase
      .channel(`inventories-store-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventories", filter: `store_id=eq.${id}` },
        (payload) => {
          const row = payload.new as Partial<InventoryRow>;
          if (!row.product_id) return;
          // 初めて在庫が登録された商品は、商品名ごと取り直す
          if (!itemsRef.current.some((item) => item.product.id === row.product_id)) {
            fetchItems(id)
              .then(setItems)
              .catch(() => {});
          } else {
            setItems((prev) =>
              prev.map((item) =>
                item.product.id === row.product_id
                  ? { ...item, quantity: row.quantity ?? item.quantity, updated_at: row.updated_at ?? item.updated_at }
                  : item,
              ),
            );
          }
          flash(row.product_id);
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, flash]);

  const grouped = useMemo(() => {
    const visible = items
      .filter((i) => !onlyInStock || i.quantity > 0)
      .sort(
        (a, b) =>
          (a.product.category ?? "").localeCompare(b.product.category ?? "", "ja") ||
          a.product.name.localeCompare(b.product.name, "ja"),
      );
    const groups = new Map<string, Item[]>();
    for (const item of visible) {
      const key = item.product.category ?? "その他";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups];
  }, [items, onlyInStock]);

  if (loading) return <p className="p-6 text-sm text-gray-500">読み込み中…</p>;
  if (error) return <p className="p-6 text-sm text-red-700">{error}</p>;
  if (!store)
    return (
      <div className="p-6 text-sm">
        店舗が見つかりません。
        <Link href="/" className="ml-2 text-blue-700 underline">
          地図に戻る
        </Link>
      </div>
    );

  const lastUpdated = items.reduce<string | null>((max, i) => (!max || i.updated_at > max ? i.updated_at : max), null);

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 地図に戻る
      </Link>
      <div className="mt-3 grid gap-4 md:grid-cols-[1fr_260px]">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{store.name}</h1>
          <dl className="mt-2 space-y-1 text-sm text-gray-700">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-gray-500">住所</dt>
              <dd>{store.address}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-gray-500">営業時間</dt>
              <dd>{store.opening_hours ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-gray-500">最終更新</dt>
              <dd>
                <UpdatedAt at={lastUpdated} now={now} />
              </dd>
            </div>
          </dl>
        </div>
        <div className="h-44 overflow-hidden rounded-lg border border-gray-200">
          <StoreMap
            compact
            zoom={15}
            center={{ lat: store.lat, lng: store.lng }}
            points={[
              {
                id: store.id,
                label: store.name,
                lat: store.lat,
                lng: store.lng,
                color: STOCK_COLORS.none,
                emphasized: true,
                flash: false,
                popup: { title: store.name, lines: [store.address] },
              },
            ]}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-900">商品と在庫</h2>
        <LiveIndicator live={live} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} />
          在庫のある商品だけ
        </label>
        <DisplayModeToggle mode={mode} onChange={setMode} />
      </div>

      {grouped.length === 0 && <p className="mt-4 text-sm text-gray-500">表示できる商品がありません</p>}
      {grouped.map(([category, list]) => (
        <section key={category} className="mt-4">
          <h3 className="mb-1 text-xs font-bold tracking-wide text-gray-500">{category}</h3>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {list.map((item) => (
              <li
                key={item.product.id}
                className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 transition-colors duration-700 ${flashing.has(item.product.id) ? "bg-yellow-100" : ""}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">{item.product.name}</div>
                  <UpdatedAt at={item.updated_at} now={now} />
                </div>
                <StockBadge quantity={item.quantity} mode={mode} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
