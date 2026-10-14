"use client";

import { useCallback, useEffect, useState } from "react";
import { STOCK_DISPLAY_MODE, type StockDisplayMode } from "@/config";

/** 「〇分前」の表示を定期的に更新するための現在時刻 */
export function useNow(intervalMs = 30_000): Date {
  // 事前描画（プリレンダー）の時刻を残さないよう、表示後に現在時刻を入れる。
  // データの読み込みは表示後に始まるため、時刻を使う表示より先に更新される。
  const [now, setNow] = useState(() => new Date(0));
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}

const DISPLAY_MODE_KEY = "stock-display-mode";

/** 在庫の見せ方。初期値は config.ts の設定で、デモでは画面から切り替えて比べられる */
export function useDisplayMode(): [StockDisplayMode, (mode: StockDisplayMode) => void] {
  const [mode, setModeState] = useState<StockDisplayMode>(STOCK_DISPLAY_MODE);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DISPLAY_MODE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 保存済みの設定は、表示後にしか読めない
      if (saved === "exact" || saved === "level") setModeState(saved);
    } catch {
      // 保存できない環境では、初期値のまま使う
    }
  }, []);

  const setMode = useCallback((next: StockDisplayMode) => {
    setModeState(next);
    try {
      localStorage.setItem(DISPLAY_MODE_KEY, next);
    } catch {
      // 保存できなくても、この画面の中では切り替わる
    }
  }, []);

  return [mode, setMode];
}

/** 変更があった行を、数秒だけ目立たせる */
export function useFlash(durationMs = 2500): [Set<string>, (key: string) => void] {
  const [keys, setKeys] = useState<Set<string>>(() => new Set());
  const flash = useCallback(
    (key: string) => {
      setKeys((prev) => new Set(prev).add(key));
      setTimeout(() => {
        setKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, durationMs);
    },
    [durationMs],
  );
  return [keys, flash];
}
