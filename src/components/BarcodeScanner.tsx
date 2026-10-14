"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { isValidJan } from "@/lib/jan";

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
};

function cameraErrorMessage(e: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "カメラは HTTPS のページでだけ使えます。公開URL（https://〜）で開いてください";
  }
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError") return "カメラの使用が許可されていません。ブラウザの設定でカメラを許可してください";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "この端末でカメラが見つかりません";
  if (name === "NotReadableError") return "カメラをほかのアプリが使っています";
  return `カメラを起動できませんでした（${e instanceof Error ? e.message : String(e)}）`;
}

/**
 * カメラでJANコード（EAN-13 / EAN-8）を読み取る。
 * iPhone の Safari でも動くよう、ブラウザ標準の BarcodeDetector ではなく ZXing を使う。
 */
export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let stopped = false;

    (async () => {
      try {
        // 読み取りライブラリは、カメラを使うときだけ読み込む
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]]]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
        if (stopped || !videoRef.current) return;
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current,
          (result, _err, ctrl) => {
            const text = result?.getText();
            if (text && isValidJan(text)) {
              ctrl.stop();
              navigator.vibrate?.(80);
              onDetectedRef.current(text);
            }
          },
        );
        if (stopped) controls.stop();
      } catch (e) {
        if (!stopped) setError(cameraErrorMessage(e));
      } finally {
        if (!stopped) setStarting(false);
      }
    })();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-300 bg-black">
      <div className="relative aspect-[4/3] w-full">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
        {/* 読み取り位置の目安 */}
        <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-24 -translate-y-1/2 rounded-md border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        <div className="pointer-events-none absolute inset-x-[14%] top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
        {starting && !error && (
          <p className="absolute inset-x-0 top-3 text-center text-sm text-white">カメラを起動しています…</p>
        )}
        {error && <p className="absolute inset-x-3 top-3 rounded bg-red-600/90 p-2 text-sm text-white">{error}</p>}
      </div>
      <div className="flex items-center justify-between bg-gray-900 px-3 py-2">
        <span className="text-xs text-gray-300">バーコードを枠の中に横向きで写してください</span>
        <button type="button" onClick={onClose} className="rounded bg-white/15 px-3 py-1 text-sm text-white">
          閉じる
        </button>
      </div>
    </div>
  );
}
