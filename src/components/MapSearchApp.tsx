"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CENTER } from "@/config";
import { useDisplayMode, useFlash, useNow } from "@/lib/hooks";
import { escapeLike, normalizeForSearch } from "@/lib/normalize";
import { STOCK_COLORS, stockLabel, stockLevel } from "@/lib/stock";
import { supabase } from "@/lib/supabase";
import { formatDistance, formatRelative } from "@/lib/time";
import type { InventoryRow, LatLng, NearbyStore, Product } from "@/lib/types";
import type { MapPoint } from "./StoreMap";
import { DisplayModeToggle, LiveIndicator, StockBadge, Toast, UpdatedAt } from "./ui";

const StoreMap = dynamic(() => import("./StoreMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-gray-100" />,
});

const SAMPLE_QUERIES = ["麦茶", "ﾋﾞﾆｰﾙ傘", "抹茶ロール", "2026100000014"];

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
        const lines = [`${s.opening_hours ?? ""}　現在地から ${formatDistance(s.distance_m)}`];
        if (product) {
          lines.unshift(`${product.name}：${stockLabel(s.quantity, mode)}`);
          lines.push(s.updated_at ? `${formatRelative(s.updated_at, now)}に更新` : "更新記録なし");
        }
        return {
          id: s.id,
          label: shortName(s.name),
          lat: s.lat,
          lng: s.lng,
          color: product ? STOCK_COLORS[level] : STOCK_COLORS.none,
          emphasized: product ? level !== "out" : false,
          flash: flashing.has(s.id),
          popup: { title: s.name, lines, href: `/stores/${s.id}` },
        };
      }),
    [stores, product, mode, now, flashing],
  );

  const inStock = product ? stores.filter((s) => (s.quantity ?? 0) > 0) : stores;
  const outOfStock = product ? stores.filter((s) => (s.quantity ?? 0) <= 0) : [];

  return (
    // スマートフォンでは「検索 → 地図 → 店舗リスト」の縦並び、PCでは左に検索とリスト、右に地図
    <div className="grid min-h-0 flex-1 grid-rows-[auto_45vh_auto] md:grid-cols-[400px_1fr] md:grid-rows-[auto_1fr]">
      {/* 検索 */}
      <div className="sticky top-0 z-10 space-y-2 border-b border-gray-200 bg-white p-3 md:static md:col-start-1 md:row-start-1 md:border-r">
        <div className="relative">
          <label htmlFor="product-search" className="sr-only">
            商品名またはJANコードで検索
          </label>
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
            placeholder="商品名またはJANコードで検索"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          {showSuggestions && query && (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {suggestions.length === 0 && (
                <li className="px-3 py-2.5 text-sm text-gray-500">該当する商品がありません</li>
              )}
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => chooseProduct(p)}
                    className="block w-full px-3 py-2.5 text-left hover:bg-blue-50"
                  >
                    <span className="block text-sm font-medium text-gray-900">{p.name}</span>
                    <span className="block text-xs text-gray-500">
                      {p.category}　JAN {p.jan_code}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!product && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-500">例：</span>
            {SAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => runSample(q)}
                className="rounded-full border border-gray-300 px-2.5 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
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
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {locating ? "現在地を取得中…" : userLocation ? "現在地を更新" : "現在地から探す"}
          </button>
          <DisplayModeToggle mode={mode} onChange={setMode} />
          <LiveIndicator live={live} />
        </div>
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-2 underline">
              閉じる
            </button>
          </p>
        )}
      </div>

      {/* 地図 */}
      <section className="min-h-0 md:col-start-2 md:row-span-2 md:row-start-1">
        <StoreMap
          points={points}
          center={origin}
          userLocation={userLocation}
          selectedId={selectedStoreId}
          onSelect={setSelectedStoreId}
        />
      </section>

      {/* 店舗リスト */}
      <div className="border-gray-200 md:col-start-1 md:row-start-2 md:min-h-0 md:overflow-y-auto md:border-r">
        <h2 className="px-3 pt-3 text-sm font-bold text-gray-900">
          {product ? (
            <>
              「{product.name}」の在庫がある店舗 <span className="text-blue-700">{inStock.length}件</span>
            </>
          ) : (
            <>店舗（{userLocation ? "現在地" : "東京駅"}から近い順）</>
          )}
        </h2>
        <ul className="divide-y divide-gray-100">
          {[...inStock, ...outOfStock].map((s) => {
            const out = product && (s.quantity ?? 0) <= 0;
            return (
              <li
                key={s.id}
                className={`transition-colors duration-700 ${flashing.has(s.id) ? "bg-yellow-100" : selectedStoreId === s.id ? "bg-blue-50" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedStoreId(s.id)}
                  className={`block w-full px-3 py-3 text-left ${out ? "opacity-55" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-gray-900">{s.name}</span>
                    <span className="shrink-0 text-xs text-gray-500">{formatDistance(s.distance_m)}</span>
                  </div>
                  {product ? (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <StockBadge quantity={s.quantity} mode={mode} />
                      <UpdatedAt at={s.updated_at} now={now} />
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-gray-500">
                      {s.address}　{s.opening_hours}
                    </div>
                  )}
                </button>
                <div className="px-3 pb-3">
                  <Link href={`/stores/${s.id}`} className="text-xs font-semibold text-blue-700 underline">
                    この店舗の在庫一覧
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <Toast message={toast} />
    </div>
  );
}
