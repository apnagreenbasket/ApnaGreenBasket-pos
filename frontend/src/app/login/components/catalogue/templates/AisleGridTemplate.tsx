/**
 * AisleGridTemplate — "Aisle Grid" A4 print template.
 *
 * Palette: bg #FAFAF6, card #FFFFFF, brand green #1B6B45 / #123A26,
 *          category accent rotation: #C1613D (root), #7C4B72 (allium),
 *          #D64545 (tomato), #E2A33B (aromatic), #4C8C4A (greens)
 * Fonts: Space Grotesk (display), Inter (body), JetBrains Mono (utility)
 * Structure: white topbar + dark strip → Aisle sections with vertical rail → 3-col card grid → footer
 */

"use client";

import React from "react";
import type { TemplateProps, CatalogueCategory, CatalogueItem } from "./templateRegistry";

/* ── colour tokens ─────────────────────────────────────────────── */
const C = {
  bg: "#FAFAF6",
  card: "#FFFFFF",
  brandGreen: "#1B6B45",
  brandDark: "#123A26",
  text: "#1A1A1A",
  textMuted: "#6B6B6B",
  border: "#E5E5E0",
} as const;

const ACCENT_ROTATION = ["#C1613D", "#7C4B72", "#D64545", "#E2A33B", "#4C8C4A"];
function getAccent(index: number): string {
  return ACCENT_ROTATION[index % ACCENT_ROTATION.length];
}

/* ── Topbar ────────────────────────────────────────────────────── */
function Topbar({ outletInfo }: Pick<TemplateProps, "outletInfo">) {
  return (
    <div>
      {/* White top area */}
      <div
        style={{
          padding: "16px 28px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {outletInfo.logo_url && (
            <img
              src={outletInfo.logo_url}
              alt=""
              style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }}
            />
          )}
          <div>
            <div
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 20,
                fontWeight: 700,
                color: C.brandDark,
                lineHeight: 1.1,
              }}
            >
              {outletInfo.name}
            </div>
            {outletInfo.address && (
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: C.textMuted, marginTop: 2 }}>
                {outletInfo.address}
              </div>
            )}
          </div>
        </div>
        {outletInfo.phone && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.brandGreen, fontWeight: 600 }}>
            {outletInfo.phone}
          </div>
        )}
      </div>

      {/* Dark strip */}
      <div
        style={{
          background: C.brandDark,
          padding: "5px 28px",
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 7.5,
          color: "rgba(255,255,255,0.7)",
          letterSpacing: 0.3,
        }}
      >
        {outletInfo.gstin && <span>GSTIN: {outletInfo.gstin}</span>}
        {outletInfo.fssai_no && <span>FSSAI Lic: {outletInfo.fssai_no}</span>}
        {!outletInfo.gstin && !outletInfo.fssai_no && <span>&nbsp;</span>}
      </div>
    </div>
  );
}

/* ── Aisle section ─────────────────────────────────────────────── */
function AisleSection({ category, index }: { category: CatalogueCategory; index: number }) {
  const accent = getAccent(index);
  const aisleNum = String(index + 1).padStart(2, "0");

  return (
    <div style={{ display: "flex", gap: 0, pageBreakInside: "avoid" }}>
      {/* Vertical rail label */}
      <div
        style={{
          width: 28,
          background: accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 9,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: 1.5,
          textTransform: "uppercase",
          padding: "12px 0",
          borderRadius: "0 0 0 4px",
          flexShrink: 0,
        }}
      >
        AISLE {aisleNum}
      </div>

      {/* Section content */}
      <div style={{ flex: 1, padding: "8px 20px 8px 12px" }}>
        {/* Section title */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              color: C.text,
            }}
          >
            {category.name_en}
          </span>
          {category.name_hi && (
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: C.textMuted }}>
              {category.name_hi}
            </span>
          )}
          <div style={{ flex: 1, borderBottom: `1px solid ${C.border}`, marginLeft: 4 }} />
        </div>

        {/* Cards grid */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignContent: "flex-start",
          }}
        >
          {category.items.map((item) => (
            <AisleCard key={item.id} item={item} accent={accent} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Product card ──────────────────────────────────────────────── */
function AisleCard({ item, accent }: { item: CatalogueItem; accent: string }) {
  return (
    <div
      style={{
        width: "calc((100% - 16px) / 3)",
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "8px 8px 6px",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        minHeight: 90,
      }}
    >
      {/* Discount badge chip */}
      {item.discount_pct > 0 && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            background: accent,
            color: "#fff",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 8,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 10,
            lineHeight: 1.5,
          }}
        >
          -{item.discount_pct}%
        </div>
      )}

      {/* Image + name */}
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              objectFit: "cover",
              border: `1px solid ${C.border}`,
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: "#F0F0EB",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            🥬
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10.5,
              fontWeight: 600,
              color: C.text,
              lineHeight: 1.25,
              wordBreak: "break-word",
            }}
          >
            {item.name_en}
          </div>
          {item.name_hi && (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 8.5, color: C.textMuted, marginTop: 1 }}>
              {item.name_hi}
            </div>
          )}
        </div>
      </div>

      {/* Price */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginTop: "auto",
          paddingTop: 4,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            fontWeight: 700,
            color: C.brandGreen,
          }}
        >
          ₹{item.price.toFixed(0)}
        </span>
        {item.mrp > item.price && (
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              color: C.textMuted,
              textDecoration: "line-through",
            }}
          >
            ₹{item.mrp.toFixed(0)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Footer ────────────────────────────────────────────────────── */
function AisleFooter({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  const pg = String(pageNumber).padStart(2, "0");
  const tot = String(totalPages).padStart(2, "0");

  return (
    <div
      style={{
        borderTop: `1px solid ${C.border}`,
        padding: "8px 28px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "#FFFFFF",
      }}
    >
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 8, color: C.textMuted }}>
        Prices valid as of print date. Subject to change.
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 14,
          fontWeight: 700,
          color: C.brandDark,
          letterSpacing: 2,
        }}
      >
        {pg} / {tot}
      </span>
    </div>
  );
}

/* ── Main template ─────────────────────────────────────────────── */
export function AisleGridTemplate({ batch, pageNumber, totalPages, outletInfo }: TemplateProps) {
  return (
    <div
      className="aisle-grid-page"
      style={{
        width: 794,
        minHeight: 1123,
        maxHeight: 1123,
        background: C.bg,
        fontFamily: "'Inter', sans-serif",
        color: C.text,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box",
        pageBreakAfter: "always",
      }}
    >
      <Topbar outletInfo={outletInfo} />

      {/* Body — aisle sections */}
      <div style={{ flex: 1, overflow: "hidden", padding: "8px 0 4px" }}>
        {batch.categories.map((cat, i) => (
          <AisleSection key={cat.id} category={cat} index={i} />
        ))}
      </div>

      <AisleFooter pageNumber={pageNumber} totalPages={totalPages} />
    </div>
  );
}
