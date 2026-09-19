/**
 * QrCodesTab — QR code generator tab for the admin dashboard.
 *
 * Generates single and batch printable QR codes for customer self-ordering.
 * Extracted from admin page.tsx (lines 5631-5801).
 */

"use client";

import { useState, useEffect } from "react";
import { Layers, QrCode } from "lucide-react";
import type { RestaurantProfile } from "../adminTypes";
import { apiRequest } from "../adminUtils";

type QrCodesTabProps = {
  restaurant: RestaurantProfile | null;
};

export function QrCodesTab({ restaurant }: QrCodesTabProps) {
  const [qrTableNumber, setQrTableNumber] = useState<string>("1");
  const [batchStart, setBatchStart] = useState<number>(1);
  const [batchEnd, setBatchEnd] = useState<number>(10);
  const [qrToken, setQrToken] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  const slug = restaurant?.slug || "apnagreenbasket-jammu";

  const fetchTokenForBasket = async (basketNum: string) => {
    setIsGenerating(true);
    try {
      const data = await apiRequest<{ token: string }>(
        `/api/sessions/qr-token?outlet_slug=${encodeURIComponent(slug)}&basket_number=${encodeURIComponent(basketNum)}`
      );
      if (data?.token) {
        setQrToken(data.token);
      }
    } catch {
      /* ignore */
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (slug && qrTableNumber) {
      void fetchTokenForBasket(qrTableNumber);
    }
  }, [slug, qrTableNumber]);

  const targetUrl = typeof window !== "undefined"
    ? `${window.location.origin}/menu?slug=${encodeURIComponent(slug)}&token=${qrToken || "generating..."}`
    : `/menu?slug=${encodeURIComponent(slug)}&token=${qrToken || "generating..."}`;

  const handleGenerateBatchSheet = async () => {
    if (typeof window === "undefined") return;
    setIsGenerating(true);
    try {
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      const qrCards = [];
      for (let i = batchStart; i <= batchEnd; i++) {
        let token = "";
        try {
          const res = await apiRequest<{ token: string }>(
            `/api/sessions/qr-token?outlet_slug=${encodeURIComponent(slug)}&basket_number=${encodeURIComponent(String(i))}`
          );
          token = res?.token || "";
        } catch {
          /* fallback */
        }
        const cardUrl = `${window.location.origin}/menu?slug=${encodeURIComponent(slug)}&token=${token}`;
        qrCards.push(`
          <div style="width: 260px; border: 4px solid #14b8a6; border-radius: 24px; padding: 24px; text-align: center; font-family: system-ui, sans-serif; page-break-inside: avoid; margin: 15px; display: inline-block; background: white; color: black; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            <h3 style="margin: 0; font-size: 20px; font-weight: 900; color: #14b8a6;">${restaurant?.name || "ApnaGreen Basket"}</h3>
            <p style="margin: 2px 0 15px 0; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em;">Scan to Order & Pay</p>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(cardUrl)}" style="width: 170px; height: 170px;" />
            <div style="background: #14b8a6; color: white; border-radius: 9999px; padding: 4px 16px; font-size: 14px; font-weight: 900; display: inline-block; margin-top: 15px; text-transform: uppercase;">Basket #${i}</div>
          </div>
        `);
      }

      printWindow.document.write(`
        <html>
          <head><title>Print QR Sheet - ${restaurant?.name || "ApnaGreen Basket"}</title></head>
          <body style="margin:0; padding:20px; background:#f3f4f6; text-align:center;">
            <div style="margin-bottom: 20px; font-family:system-ui; display:block;" class="no-print">
              <button onclick="window.print()" style="background:#14b8a6; color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:bold; cursor:pointer;">Print QR Codes Sheet</button>
              <p style="font-size:12px; color:#4b5563;">Tip: Set layout to Landscape or use smaller margins if printing multiple pages.</p>
            </div>
            <style>
              @media print {
                .no-print { display: none !important; }
                body { background: white !important; padding: 0 !important; }
              }
            </style>
            <div>${qrCards.join("")}</div>
          </body>
        </html>
      `);
      printWindow.document.close();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Cryptographic Basket QR Code Generator</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Generate secure, cryptographically random QR code tokens for customer self-ordering without exposing raw basket numbers in URLs
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Single QR Generator Form */}
        <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs self-start">
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
            <QrCode className="h-5 w-5 text-[var(--accent-brand)]" />
            <h2 className="font-display text-base font-bold">Generate Secure QR Token</h2>
          </div>

          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Basket Number</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={qrTableNumber}
                  onChange={(e) => setQrTableNumber(e.target.value)}
                  placeholder="e.g. 5, 12B, Bar-3"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm font-semibold"
                />
                <button
                  type="button"
                  onClick={() => void fetchTokenForBasket(qrTableNumber)}
                  className="rounded-xl bg-[var(--accent-brand)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--accent-brand-hover)] shrink-0"
                >
                  Generate
                </button>
              </div>
            </label>

            <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] flex flex-col items-center justify-center text-center space-y-3">
              <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-bold">Secure Cryptographic QR Link</span>
              <p className="text-[10px] font-mono text-[var(--accent-brand)] select-all break-all max-w-full">
                {targetUrl}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.print();
                }
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)]"
            >
              Print Secure QR Card
            </button>
          </div>
        </article>

        {/* Dynamic QR Preview & Printable Card */}
        <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 flex flex-col items-center justify-center space-y-6 shadow-xs min-h-[400px]">
          {/* Print container */}
          <div className="print:m-0 print:p-0 print:border-none print:shadow-none">
            <div className="w-[300px] rounded-3xl border-4 border-[var(--accent-brand)] bg-white p-6 shadow-md flex flex-col items-center justify-center text-center space-y-5 text-black">
              {/* Header */}
              <div className="space-y-1">
                <h3 className="font-display text-2xl font-black tracking-tight text-[var(--accent-brand)]">
                  {restaurant?.name || "ApnaGreen Basket"}
                </h3>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Scan to Order &amp; Pay
                </p>
              </div>

              {/* QR Code Image */}
              <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 shadow-2xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                    targetUrl
                  )}`}
                  alt={`QR Code for Basket ${qrTableNumber}`}
                  className="h-44 w-44 object-contain"
                />
              </div>

              {/* Footer badge */}
              <div className="rounded-full bg-[var(--accent-brand)] px-5 py-1 text-sm font-black text-white uppercase tracking-wider">
                Basket #{qrTableNumber}
              </div>

              <p className="text-[10px] text-gray-400 font-mono">
                Cryptographically Secured • ApnaGreen Basket
              </p>
            </div>
          </div>
        </article>
      </div>

      {/* Batch QR Generator Sheet Option */}
      <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
          <Layers className="h-5 w-5 text-[var(--accent-brand)]" />
          <h2 className="font-display text-base font-bold">Print Basket QR Sheets (Batch Mode)</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 items-end">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Start Basket Number</span>
            <input
              type="number"
              value={batchStart}
              onChange={(e) => setBatchStart(Number(e.target.value) || 1)}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm font-semibold font-mono"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">End Basket Number</span>
            <input
              type="number"
              value={batchEnd}
              onChange={(e) => setBatchEnd(Number(e.target.value) || 10)}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm font-semibold font-mono"
            />
          </label>

          <button
            type="button"
            disabled={isGenerating}
            onClick={() => void handleGenerateBatchSheet()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-brand)] hover:border-[var(--accent-brand)] disabled:opacity-50"
          >
            {isGenerating ? "Generating Secure Tokens..." : "Generate Printable Sheet"}
          </button>
        </div>
      </article>
    </div>
  );
}
