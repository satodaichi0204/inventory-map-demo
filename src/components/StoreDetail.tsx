"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDisplayMode, useFlash, useNow } from "@/lib/hooks";
import { normalizeForSearch } from "@/lib/normalize";
import { STOCK_COLORS, stockLevel, type StockLevel } from "@/lib/stock";
import { supabase } from "@/lib/supabase";
import type { InventoryRow, Product, StoreInfo } from "@/lib/types";
import {
  ChevronLeftIcon,
  ClockIcon,
  DemoNote,
  DisplayModeToggle,
  LiveIndicator,
  PinIcon,
  RefreshIcon,
  SearchIcon,
  Segmented,
  StockBadge,
  UpdatedAt,
} from "./ui";

const StoreMap = dynamic(() => import("./StoreMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-slate-100" />,
});

type Item = { product: Product; quantity: number; updated_at: string };
type Filter = "all" | "in_stock";

async function fetchItems(storeId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from("inventories")
    .select("quantity, updated_at, product:products!inner(id, jan_code, name, category)")
    .eq("store_id", storeId);
  if (error) throw error;
  return (data as unknown as Item[]) ?? [];
}

const SUMMARY: { level: StockLevel; label: string }[] = [
  { level: "in_stock", label: "在庫あり" },
  { level: "low", label: "残りわずか" },
  { level: "out", label: "在庫なし" },
];

export default function StoreDetail() {
  const { id } = useParams<{ id: string }>();
  const [mode, setMode] = useDisplayMode();
  const now = useNow();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [keyword, setKeyword] = useState("");
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

  const counts = useMemo(() => {
    const c: Record<StockLevel, number> = { in_stock: 0, low: 0, out: 0 };
    for (const i of items) c[stockLevel(i.quantity)]++;
    return c;
  }, [items]);

  const grouped = useMemo(() => {
    const kw = normalizeForSearch(keyword);
    const visible = items
      .filter((i) => filter === "all" || i.quantity > 0)
      .filter((i) => !kw || normalizeForSearch(i.product.name).includes(kw) || i.product.jan_code.startsWith(kw))
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
  }, [items, filter, keyword]);

  if (loading)
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
        <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
        <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    );
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
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-blue-700"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        地図に戻る
      </Link>

      {/* 店舗の情報 */}
      <section className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid md:grid-cols-[1fr_320px]">
          <div className="p-5 md:p-6">
            <p className="text-xs font-semibold text-blue-600">店舗の在庫</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{store.name}</h1>
            <dl className="mt-4 space-y-2 text-sm text-slate-700">
              <div className="flex items-center gap-2.5">
                <dt>
                  <PinIcon className="h-4 w-4 text-slate-400" />
                  <span className="sr-only">住所</span>
                </dt>
                <dd>{store.address}</dd>
              </div>
              <div className="flex items-center gap-2.5">
                <dt>
                  <ClockIcon className="h-4 w-4 text-slate-400" />
                  <span className="sr-only">営業時間</span>
                </dt>
                <dd>{store.opening_hours ?? "—"}</dd>
              </div>
              <div className="flex items-center gap-2.5">
                <dt>
                  <RefreshIcon className="h-4 w-4 text-slate-400" />
                  <span className="sr-only">最終更新</span>
                </dt>
                <dd>
                  <UpdatedAt at={lastUpdated} now={now} />
                </dd>
              </div>
            </dl>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {SUMMARY.map((s) => (
                <div key={s.level} className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <span className="h-2 w-2 rounded-full" style={{ background: STOCK_COLORS[s.level] }} />
                    {s.label}
                  </div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
                    {counts[s.level]}
                    <span className="ml-0.5 text-xs font-medium text-slate-400">品</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-48 border-t border-slate-200 md:h-auto md:min-h-64 md:border-l md:border-t-0">
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
      </section>

      {/* 商品と在庫 */}
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">商品と在庫</h2>
          <LiveIndicator live={live} />
        </div>
        <div className="sticky top-0 z-10 -mx-4 mt-2 flex flex-wrap items-center gap-2 bg-slate-50/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
          <div className="relative min-w-0 flex-1 basis-48">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="この店舗の商品を絞り込む"
              aria-label="この店舗の商品を絞り込む"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <Segmented
            label="表示する商品"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "すべて" },
              { value: "in_stock", label: "在庫ありのみ" },
            ]}
          />
          <DisplayModeToggle mode={mode} onChange={setMode} />
        </div>

        {grouped.length === 0 && <p className="mt-4 text-sm text-slate-500">表示できる商品がありません</p>}
        <div className="mt-2 space-y-5">
          {grouped.map(([category, list]) => (
            <div key={category}>
              <h3 className="mb-1.5 px-1 text-xs font-bold tracking-wide text-slate-500">
                {category}
                <span className="ml-1.5 font-medium text-slate-400">{list.length}</span>
              </h3>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {list.map((item) => (
                  <li
                    key={item.product.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-700 ${
                      flashing.has(item.product.id) ? "bg-amber-100/70" : ""
                    } ${item.quantity <= 0 ? "text-slate-400" : ""}`}
                  >
                    <div className="min-w-0">
                      <div
                        className={`truncate text-sm font-semibold ${item.quantity <= 0 ? "text-slate-500" : "text-slate-900"}`}
                      >
                        {item.product.name}
                      </div>
                      <div className="mt-0.5">
                        <UpdatedAt at={item.updated_at} now={now} />
                      </div>
                    </div>
                    <StockBadge quantity={item.quantity} mode={mode} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <DemoNote className="mt-8" />
    </div>
  );
}
