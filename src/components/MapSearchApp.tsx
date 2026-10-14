"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CENTER } from "@/config";
import { useDisplayMode, useFlash, useNow } from "@/lib/hooks";
import { escapeLike, normalizeForSearch } from "@/lib/normalize";
import { STOCK_COLORS, stockLabel, stockLevel } from "@/lib/stock";
import { supabase } from "@/lib/supabase";
import { formatDistance, formatUpdated } from "@/lib/time";
import type { InventoryRow, LatLng, NearbyStore, Product } from "@/lib/types";
import type { MapPoint } from "./StoreMap";
import {
  ChevronRightIcon,
  CloseIcon,
  DemoNote,
  DisplayModeToggle,
  LiveIndicator,
  LocateIcon,
  SearchIcon,
  StockBadge,
  StockLegend,
  Toast,
  UpdatedAt,
} from "./ui";

const StoreMap = dynamic(() => import("./StoreMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-slate-100" />,
});

const SAMPLE_QUERIES = ["ﾋﾞﾆｰﾙ傘", "麦茶", "抹茶ロール", "2026100000014"];

const shortName = (name: string) => name.replace(/^デモマート\s*/, "");

async function searchProducts(query: string): Promise<Product[]> {
  const q = normalizeForSearch(query);
  if (!q) return [];
  let request = supabase.from("products").select("id, jan_code, name, category").order("name").limit(8);
  request = /^\d+$/.test(q)
    ? request.or(`jan_code.like.${q}*,name_normalized.ilike.*${q}*`)
    : request.ilike("name_normalized", `%${escapeLike(q)}%`);
  const { data, error } = await request;
  if (error) throw error;
  return data ?? [];
}

export default function MapSearchApp() {
  const [mode, setMode] = useDisplayMode();
  const now = useNow();
  const [origin, setOrigin] = useState<LatLng>(DEFAULT_CENTER);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [stores, setStores] = useState<NearbyStore[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [flashing, flash] = useFlash();
  const productIdRef = useRef<string | null>(null);
  const storesRef = useRef<NearbyStore[]>([]);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    productIdRef.current = product?.id ?? null;
  }, [product]);
  useEffect(() => {
    storesRef.current = stores;
  }, [stores]);

  // 近い順の店舗と、選んだ商品の在庫数
  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("stores_nearby", { p_lat: origin.lat, p_lng: origin.lng, p_product_id: product?.id ?? null })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(`店舗を読み込めませんでした：${error.message}`);
        else setStores((data as NearbyStore[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [origin, product]);

  // 在庫の変更をリアルタイムに受け取り、再読み込みなしで反映する
  useEffect(() => {
    const channel = supabase
      .channel("inventories-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventories" }, (payload) => {
        const row = payload.new as Partial<InventoryRow>;
        if (!row.store_id || row.product_id !== productIdRef.current) return;
        setStores((prev) =>
          prev.map((s) =>
            s.id === row.store_id
              ? { ...s, quantity: row.quantity ?? 0, updated_at: row.updated_at ?? s.updated_at }
              : s,
          ),
        );
        const store = storesRef.current.find((s) => s.id === row.store_id);
        if (store) {
          setToast(`${shortName(store.name)}の在庫が更新されました（${row.quantity}個）`);
          clearTimeout(toastTimerRef.current);
          toastTimerRef.current = setTimeout(() => setToast(null), 3500);
        }
        flash(row.store_id);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [flash]);

  // 検索語の入力から少し待って候補を出す
  useEffect(() => {
    const q = query.trim();
    if (!q || q === product?.name) return;
    const timer = setTimeout(() => {
      searchProducts(q)
        .then((items) => {
          setSuggestions(items);
          setShowSuggestions(true);
        })
        .catch((e: Error) => setError(`検索できませんでした：${e.message}`));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, product]);

  const chooseProduct = useCallback((p: Product | null) => {
    setProduct(p);
    setQuery(p?.name ?? "");
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedStoreId(null);
  }, []);

  const runSample = async (q: string) => {
    setQuery(q);
    const items = await searchProducts(q).catch(() => []);
    if (items.length === 1) chooseProduct(items[0]);
    else {
      setSuggestions(items);
      setShowSuggestions(true);
    }
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setError("この端末では現在地を使えません。東京駅を中心に表示しています");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(here);
        setOrigin(here);
        setLocating(false);
      },
      () => {
        setError("現在地を取得できませんでした。東京駅を中心に表示しています");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const points: MapPoint[] = useMemo(
    () =>
      stores.map((s) => {
        const level = stockLevel(s.quantity);
        const meta = [`現在地から ${formatDistance(s.distance_m)}・${s.opening_hours ?? ""}`];
        if (product) meta.push(s.updated_at ? formatUpdated(s.updated_at, now) : "更新記録なし");
        return {
          id: s.id,
          label: shortName(s.name),
          lat: s.lat,
          lng: s.lng,
          color: product ? STOCK_COLORS[level] : STOCK_COLORS.none,
          emphasized: product ? level !== "out" : false,
          flash: flashing.has(s.id),
          popup: {
            title: s.name,
            status: product ? { label: stockLabel(s.quantity, mode), color: STOCK_COLORS[level] } : undefined,
            lines: meta,
            href: `/stores/${s.id}`,
          },
        };
      }),
    [stores, product, mode, now, flashing],
  );

  const inStock = product ? stores.filter((s) => (s.quantity ?? 0) > 0) : stores;
  const outOfStock = product ? stores.filter((s) => (s.quantity ?? 0) <= 0) : [];

  const storeRow = (s: NearbyStore) => {
    const out = product && (s.quantity ?? 0) <= 0;
    const color = product ? STOCK_COLORS[stockLevel(s.quantity)] : STOCK_COLORS.none;
    const selected = selectedStoreId === s.id;
    return (
      <li
        key={s.id}
        className={`group relative flex items-stretch transition-colors duration-700 ${
          flashing.has(s.id) ? "bg-amber-100/70" : selected ? "bg-blue-50/70" : "hover:bg-slate-50"
        }`}
      >
        {selected && <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-blue-600" />}
        <button
          type="button"
          onClick={() => setSelectedStoreId(s.id)}
          className={`flex min-w-0 flex-1 items-start gap-3 py-3.5 pl-4 text-left ${out ? "opacity-60" : ""}`}
        >
          <span
            className="mt-1.5 h-3 w-3 shrink-0 rounded-full ring-[3px] ring-white"
            style={{ background: color, boxShadow: `0 0 0 1px ${color}40` }}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[15px] font-semibold text-slate-900">{s.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">{formatDistance(s.distance_m)}</span>
            </span>
            {product ? (
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <StockBadge quantity={s.quantity} mode={mode} />
                <UpdatedAt at={s.updated_at} now={now} compact />
              </span>
            ) : (
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {s.opening_hours}・{s.address}
              </span>
            )}
          </span>
        </button>
        <Link
          href={`/stores/${s.id}`}
          aria-label={`${s.name}の在庫一覧`}
          title="店舗の在庫一覧"
          className="flex shrink-0 items-center px-3 text-slate-300 transition hover:text-blue-600"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </Link>
      </li>
    );
  };

  return (
    // スマートフォンでは「検索 → 地図 → 店舗リスト」の縦並び、PCでは左に検索とリスト、右に地図
    <div className="grid min-h-0 flex-1 grid-rows-[auto_42vh_auto] bg-white md:grid-cols-[420px_1fr] md:grid-rows-[auto_1fr]">
      {/* 検索 */}
      <div className="sticky top-0 z-20 space-y-3 border-b border-slate-200 bg-white px-4 pb-3 pt-4 md:static md:col-start-1 md:row-start-1 md:border-r">
        <div className="hidden md:block">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">在庫のある店舗を探す</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            商品名（ひらがな・カタカナ・半角でも可）か、JANコードで検索できます
          </p>
        </div>

        <div className="relative">
          <label htmlFor="product-search" className="sr-only">
            商品名またはJANコードで検索
          </label>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            id="product-search"
            type="search"
            inputMode="search"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) chooseProduct(null);
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="商品名またはJANコード"
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-11 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => chooseProduct(null)}
              aria-label="検索をクリア"
              className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
          {showSuggestions && query && (
            <ul className="absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
              {suggestions.length === 0 && (
                <li className="px-3 py-3 text-sm text-slate-500">該当する商品がありません</li>
              )}
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => chooseProduct(p)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-blue-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{p.name}</span>
                      <span className="block font-mono text-[11px] text-slate-400">JAN {p.jan_code}</span>
                    </span>
                    {p.category && (
                      <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                        {p.category}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {product ? (
          <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white text-center shadow-sm ring-1 ring-blue-100">
              <span className="text-lg font-bold leading-none text-blue-700">{inStock.length}</span>
              <span className="-mt-1 text-[10px] text-slate-500">/{stores.length}店</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{product.name}</p>
              <p className="text-xs text-slate-500">
                {inStock.length > 0 ? `${inStock.length}店舗に在庫があります` : "在庫のある店舗はありません"}
                {product.category && <span className="text-slate-400">・{product.category}</span>}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400">試す：</span>
            {SAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => runSample(q)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <LocateIcon className={`h-4 w-4 ${userLocation ? "text-blue-600" : ""}`} />
            {locating ? "取得中…" : userLocation ? "現在地を更新" : "現在地から探す"}
          </button>
          <DisplayModeToggle mode={mode} onChange={setMode} />
        </div>

        {error && (
          <p
            className="flex items-start justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
            role="alert"
          >
            {error}
            <button type="button" onClick={() => setError(null)} aria-label="閉じる" className="shrink-0">
              <CloseIcon className="h-4 w-4" />
            </button>
          </p>
        )}
      </div>

      {/* 地図 */}
      <section className="relative min-h-0 md:col-start-2 md:row-span-2 md:row-start-1">
        <StoreMap
          points={points}
          center={origin}
          userLocation={userLocation}
          selectedId={selectedStoreId}
          onSelect={setSelectedStoreId}
        />
        <div className="pointer-events-none absolute left-3 top-3 z-10">
          <LiveIndicator
            live={live}
            className="rounded-full bg-white/95 px-3 py-1.5 shadow-md ring-1 ring-slate-900/5 backdrop-blur"
          />
        </div>
        {product && (
          <div className="pointer-events-none absolute bottom-8 left-3 z-10">
            <StockLegend />
          </div>
        )}
      </section>

      {/* 店舗リスト */}
      <div className="border-slate-200 md:col-start-1 md:row-start-2 md:min-h-0 md:overflow-y-auto md:border-r">
        <h2 className="flex items-center justify-between px-4 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
          <span>
            {product ? "在庫のある店舗" : "店舗"}（{userLocation ? "現在地" : "東京駅"}から近い順）
          </span>
          <span className="tabular-nums">{inStock.length}件</span>
        </h2>
        {product && inStock.length === 0 && (
          <p className="px-4 py-3 text-sm text-slate-500">現在、在庫のある店舗はありません。</p>
        )}
        <ul className="divide-y divide-slate-100">{inStock.map(storeRow)}</ul>
        {outOfStock.length > 0 && (
          <>
            <h2 className="flex items-center justify-between border-t border-slate-100 px-4 pb-1 pt-4 text-xs font-bold tracking-wide text-slate-400">
              <span>在庫なしの店舗</span>
              <span className="tabular-nums">{outOfStock.length}件</span>
            </h2>
            <ul className="divide-y divide-slate-100">{outOfStock.map(storeRow)}</ul>
          </>
        )}
        <DemoNote className="px-4 py-4" />
      </div>

      <Toast message={toast} />
    </div>
  );
}
