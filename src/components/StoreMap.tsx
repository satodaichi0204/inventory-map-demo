"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  getVersion,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEFAULT_ZOOM, MAP_STYLE_URL } from "@/config";
import type { LatLng } from "@/lib/types";

// 地図の処理用ワーカーは public/maplibre/ から配信する（scripts/copy-maplibre-worker.mjs を参照）
setWorkerUrl(`/maplibre/maplibre-gl-worker.mjs?v=${getVersion()}`);

export type MapPoint = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  color: string;
  emphasized: boolean;
  flash: boolean;
  popup: {
    title: string;
    status?: { label: string; color: string };
    lines: string[];
    href?: string;
  };
};

type Props = {
  points: MapPoint[];
  center: LatLng;
  zoom?: number;
  userLocation?: LatLng | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** 店舗の詳細ページの小窓用。操作をしぼる */
  compact?: boolean;
};

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function toGeoJson(points: MapPoint[], selectedId: string | null | undefined): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      id: p.id,
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        label: p.label,
        color: p.color,
        emphasized: p.emphasized ? 1 : 0,
        flash: p.flash ? 1 : 0,
        selected: p.id === selectedId ? 1 : 0,
        // 在庫のある店舗を上に描く
        order: p.emphasized ? 1 : 0,
      },
    })),
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function popupContent(popup: MapPoint["popup"]): HTMLElement {
  const root = el("div", "min-w-[200px] pr-4 font-sans");
  root.append(el("div", "text-[14px] font-bold leading-snug text-slate-900", popup.title));
  if (popup.status) {
    const status = el("div", "mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-800");
    const dot = el("span", "inline-block h-2 w-2 rounded-full");
    dot.style.background = popup.status.color;
    status.append(dot, document.createTextNode(popup.status.label));
    root.append(status);
  }
  for (const line of popup.lines) root.append(el("div", "mt-0.5 text-[12px] text-slate-500", line));
  if (popup.href) {
    const a = el(
      "a",
      "mt-2.5 flex items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700",
      "店舗の在庫一覧を見る",
    );
    (a as HTMLAnchorElement).href = popup.href;
    root.append(a);
  }
  return root;
}

export default function StoreMap({ points, center, zoom, userLocation, selectedId, onSelect, compact }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const onSelectRef = useRef(onSelect);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // 地図の作成は1回だけ
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [center.lng, center.lat],
      zoom: zoom ?? DEFAULT_ZOOM,
      attributionControl: { compact: true },
      cooperativeGestures: compact,
      interactive: !compact,
    });
    mapRef.current = map;
    if (!compact) map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      // 小さな地図では、地図の出典表示を ⓘ ボタンにたたんでおく
      if (compact)
        containerRef.current?.querySelector(".maplibregl-compact-show")?.classList.remove("maplibregl-compact-show");
      map.addSource("stores", { type: "geojson", data: EMPTY });
      map.addSource("me", { type: "geojson", data: EMPTY });

      // 在庫が更新された店舗を、数秒だけ大きな円で目立たせる
      map.addLayer({
        id: "stores-flash",
        type: "circle",
        source: "stores",
        filter: ["==", ["get", "flash"], 1],
        paint: {
          "circle-radius": 30,
          "circle-color": ["get", "color"],
          "circle-opacity": 0.22,
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.6,
        },
      });
      // 選んだ店舗の外側の輪
      map.addLayer({
        id: "stores-selected",
        type: "circle",
        source: "stores",
        filter: ["==", ["get", "selected"], 1],
        paint: {
          "circle-radius": 19,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#1d4ed8",
          "circle-stroke-width": 2.5,
        },
      });
      map.addLayer({
        id: "stores-circle",
        type: "circle",
        source: "stores",
        layout: { "circle-sort-key": ["get", "order"] },
        paint: {
          "circle-radius": ["case", ["==", ["get", "emphasized"], 1], 11, 8],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });
      if (!compact) {
        map.addLayer({
          id: "stores-label",
          type: "symbol",
          source: "stores",
          layout: {
            "text-field": ["get", "label"],
            "text-size": 12,
            "text-offset": [0, 1.5],
            "text-anchor": "top",
            "text-font": ["Noto Sans Bold"],
            "text-optional": true,
          },
          paint: { "text-color": "#1e293b", "text-halo-color": "#ffffff", "text-halo-width": 2 },
        });
      }
      map.addLayer({
        id: "me-halo",
        type: "circle",
        source: "me",
        paint: { "circle-radius": 18, "circle-color": "#3b82f6", "circle-opacity": 0.15 },
      });
      map.addLayer({
        id: "me",
        type: "circle",
        source: "me",
        paint: {
          "circle-radius": 7,
          "circle-color": "#3b82f6",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });

      map.on("click", "stores-circle", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectRef.current?.(id);
      });
      map.on("mouseenter", "stores-circle", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "stores-circle", () => (map.getCanvas().style.cursor = ""));
      setLoaded(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // 中心とズームは初期値としてだけ使う（以降の移動は下の effect で行う）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  useEffect(() => {
    if (!loaded) return;
    (mapRef.current?.getSource("stores") as GeoJSONSource | undefined)?.setData(toGeoJson(points, selectedId));
  }, [loaded, points, selectedId]);

  useEffect(() => {
    if (!loaded) return;
    const data: GeoJSON.FeatureCollection = userLocation
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [userLocation.lng, userLocation.lat] },
              properties: {},
            },
          ],
        }
      : EMPTY;
    (mapRef.current?.getSource("me") as GeoJSONSource | undefined)?.setData(data);
  }, [loaded, userLocation]);

  useEffect(() => {
    if (!loaded) return;
    mapRef.current?.flyTo({ center: [center.lng, center.lat], speed: 1.6 });
  }, [loaded, center.lat, center.lng]);

  // 選んだ店舗の吹き出し。在庫が変われば内容も更新する
  const selected = points.find((p) => p.id === selectedId);
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    if (!selected) {
      popupRef.current?.remove();
      popupRef.current = null;
      return;
    }
    if (!popupRef.current) {
      popupRef.current = new Popup({ offset: 16, closeButton: true, maxWidth: "280px" });
      popupRef.current.on("close", () => onSelectRef.current?.(null));
    }
    popupRef.current.setLngLat([selected.lng, selected.lat]).setDOMContent(popupContent(selected.popup)).addTo(map);
  }, [loaded, selected]);

  useEffect(() => {
    if (!loaded || !selectedId) return;
    const target = points.find((p) => p.id === selectedId);
    if (target) mapRef.current?.easeTo({ center: [target.lng, target.lat], offset: [0, 60] });
    // 選択が変わったときだけ移動する（在庫の更新では動かさない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, selectedId]);

  return <div ref={containerRef} className="h-full w-full" aria-label="店舗の地図" />;
}
