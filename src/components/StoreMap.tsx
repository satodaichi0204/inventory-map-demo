"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, NavigationControl, Popup, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEFAULT_ZOOM, MAP_STYLE_URL } from "@/config";
import type { LatLng } from "@/lib/types";

export type MapPoint = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  color: string;
  emphasized: boolean;
  flash: boolean;
  popup: { title: string; lines: string[]; href?: string };
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

function toGeoJson(points: MapPoint[]): GeoJSON.FeatureCollection {
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
      },
    })),
  };
}

function popupContent(popup: MapPoint["popup"]): HTMLElement {
  const root = document.createElement("div");
  root.className = "text-sm leading-relaxed";
  const title = document.createElement("div");
  title.className = "font-bold text-gray-900";
  title.textContent = popup.title;
  root.append(title);
  for (const line of popup.lines) {
    const el = document.createElement("div");
    el.className = "text-gray-700";
    el.textContent = line;
    root.append(el);
  }
  if (popup.href) {
    const a = document.createElement("a");
    a.href = popup.href;
    a.className = "mt-1 inline-block font-semibold text-blue-700 underline";
    a.textContent = "店舗の詳細を見る";
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
    });
    mapRef.current = map;
    if (!compact) map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("stores", { type: "geojson", data: EMPTY });
      map.addSource("me", { type: "geojson", data: EMPTY });

      // 在庫が更新された店舗を、数秒だけ大きな円で目立たせる
      map.addLayer({
        id: "stores-flash",
        type: "circle",
        source: "stores",
        filter: ["==", ["get", "flash"], 1],
        paint: {
          "circle-radius": 26,
          "circle-color": ["get", "color"],
          "circle-opacity": 0.3,
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "stores-circle",
        type: "circle",
        source: "stores",
        paint: {
          "circle-radius": ["case", ["==", ["get", "emphasized"], 1], 11, 7],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
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
            "text-offset": [0, 1.4],
            "text-anchor": "top",
            "text-font": ["Noto Sans Regular"],
          },
          paint: { "text-color": "#1f2937", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
        });
      }
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
    (mapRef.current?.getSource("stores") as GeoJSONSource | undefined)?.setData(toGeoJson(points));
  }, [loaded, points]);

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
      popupRef.current = new Popup({ offset: 14, closeButton: true, maxWidth: "260px" });
      popupRef.current.on("close", () => onSelectRef.current?.(null));
    }
    popupRef.current.setLngLat([selected.lng, selected.lat]).setDOMContent(popupContent(selected.popup)).addTo(map);
  }, [loaded, selected]);

  useEffect(() => {
    if (!loaded || !selectedId) return;
    const target = points.find((p) => p.id === selectedId);
    if (target) mapRef.current?.easeTo({ center: [target.lng, target.lat] });
    // 選択が変わったときだけ移動する（在庫の更新では動かさない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, selectedId]);

  return <div ref={containerRef} className="h-full w-full" aria-label="店舗の地図" />;
}
