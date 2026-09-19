/**
 * MandiLedgerTemplate — "Mandi Ledger" A4 print template.
 *
 * Palette: paper #F4EEDD, card #FBF7EA, ink #241F16, forest #1F3D2B / #132A1C,
 *          turmeric #E0A03B, stamp red #AD3A2C, line #D9CDA9
 * Fonts: Fraunces (display/italic category titles), IBM Plex Sans (body), IBM Plex Mono (data)
 * Structure: dark forest masthead → category bands → 3-col hanging tag cards → dashed footer
 */

"use client";

import React from "react";
import type { TemplateProps, CatalogueCategory, CatalogueItem } from "./templateRegistry";

/* ── colour tokens ─────────────────────────────────────────────── */
const C = {
  paper: "#FDFBF7", // Classy elegant ivory/alabaster
  card: "#FFFFFF", // Crisp white for contrast
  ink: "#241F16",
  forest: "#1F3D2B",
  forestDark: "#132A1C",
  turmeric: "#E0A03B",
  stampRed: "#AD3A2C",
  line: "#D9CDA9",
  lineLight: "#E8DFC6",
} as const;

/* ── Masthead ──────────────────────────────────────────────────── */
function Masthead({ outletInfo }: Pick<TemplateProps, "outletInfo">) {
  let website = "";
  if (outletInfo.bill_qr_url) {
    try {
      const url = new URL(outletInfo.bill_qr_url);
      website = url.hostname;
    } catch {
      website = outletInfo.bill_qr_url;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          background: C.paper,
          padding: "16px 28px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          borderBottom: `1px solid ${C.lineLight}`,
        }}
      >
        {/* Brand side */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {outletInfo.logo_url && (
            <img
              src={outletInfo.logo_url}
              alt=""
              style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", border: `2px solid ${C.turmeric}` }}
            />
          )}
          <div>
            <div
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 26,
                fontWeight: 700,
                color: C.forestDark,
                lineHeight: 1.1,
              }}
            >
              {outletInfo.name}
            </div>
            {outletInfo.address && (
              <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, color: C.ink, opacity: 0.8, marginTop: 4 }}>
                {outletInfo.address}
              </div>
            )}
          </div>
        </div>

        {/* Contact & App side */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.ink, opacity: 0.8, lineHeight: 1.6 }}>
            {website && <div>🌐 {website}</div>}
            {outletInfo.phone && <div>☎ {outletInfo.phone}</div>}
            {outletInfo.gstin && <div>GSTIN: {outletInfo.gstin}</div>}
            {outletInfo.fssai_no && <div>FSSAI: {outletInfo.fssai_no}</div>}
          </div>

          {/* App Store Links */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 8, fontFamily: "'IBM Plex Sans', sans-serif", color: C.turmeric, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Download our App (Click Icon)
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a href="https://play.google.com/store/apps/details?id=com.apnagreenbasket" target="_blank" rel="noreferrer" style={{ display: "block" }}>
                <img src="/images/google-play.png" alt="Get it on Google Play" style={{ height: 20, borderRadius: 4 }} />
              </a>
              <a href="https://www.apple.com/app-store/" target="_blank" rel="noreferrer" style={{ display: "block" }}>
                <img src="/images/app-store.png" alt="Download on the App Store" style={{ height: 20, borderRadius: 4 }} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



function ProductCard({ item, showEveningPrice }: { item: CatalogueItem; showEveningPrice: boolean }) {
  const save = item.mrp - item.price;
  const showStamp = save > 0;
  const eveningActive = showEveningPrice && item.evening_price && item.evening_price > 0;

  return (
    <div
      style={{
        width: "calc((100% - 20px) / 3)",
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: 230,
        pageBreakInside: "avoid",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      {/* Discount Badge */}
      {showStamp && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            background: C.stampRed,
            color: "#fff",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            fontWeight: 800,
            padding: "2px 6px",
            borderRadius: 4,
            zIndex: 2,
          }}
        >
          SAVE ₹{save.toFixed(0)}
        </div>
      )}

      {/* Evening Special Tilted Badge */}
      {eveningActive && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: -14,
            transform: "rotate(15deg)",
            background: C.forestDark,
            color: C.turmeric,
            fontFamily: "'Fraunces', serif",
            fontSize: 9,
            fontWeight: 800,
            padding: "4px 16px",
            borderRadius: 4,
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            zIndex: 2,
          }}
        >
          EVENING SPL PRICE
        </div>
      )}

      {/* Image Header */}
      <div style={{ width: "100%", height: 150, background: C.lineLight, position: "relative" }}>
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              opacity: 0.8,
            }}
          >
            🌿
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "8px 12px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {/* Line 1: Name */}
        <div
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 15,
            fontWeight: 700,
            color: C.forestDark,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.name_en} {item.name_hi && <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, color: C.ink, opacity: 0.6 }}>({item.name_hi})</span>}
        </div>

        {/* Line 2: Prices */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            {item.mrp > 0 && (
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  color: C.ink,
                  opacity: 0.5,
                  textDecoration: "line-through",
                  fontWeight: 600,
                }}
              >
                ₹{item.mrp.toFixed(0)}
              </span>
            )}
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 20,
                fontWeight: 800,
                color: C.forestDark,
                lineHeight: 1,
              }}
            >
              ₹{item.price.toFixed(0)}
            </span>
          </div>

          {eveningActive && (
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 800, color: C.forestDark }}>
              🌙 ₹{item.evening_price!.toFixed(0)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Footer ────────────────────────────────────────────────────── */
function Footer({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <div
      style={{
        borderTop: `2px dashed ${C.line}`,
        padding: "8px 28px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 8,
        color: C.ink,
        opacity: 0.6,
      }}
    >
      <span>Prices valid as of print date. Subject to change.</span>
      <span
        style={{
          background: C.forest,
          color: "#fff",
          padding: "2px 10px",
          borderRadius: 3,
          fontSize: 8,
          fontWeight: 600,
        }}
      >
        Page {pageNumber} of {totalPages}
      </span>
    </div>
  );
}

/* ── Main template ─────────────────────────────────────────────── */
export function MandiLedgerTemplate({ batch, pageNumber, totalPages, outletInfo }: TemplateProps) {
  return (
    <table
      className="mandi-ledger-page"
      style={{
        width: "100%",
        maxWidth: 794,
        background: C.paper,
        fontFamily: "'IBM Plex Sans', sans-serif",
        color: C.ink,
        boxSizing: "border-box",
        borderCollapse: "collapse",
      }}
    >
      <style>{`
        @media print {
          .mandi-ledger-page {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
      <thead style={{ display: "table-header-group" }}>
        <tr>
          <td style={{ padding: 0 }}>
            <Masthead outletInfo={outletInfo} />
          </td>
        </tr>
      </thead>

      <tbody>
        <tr>
          <td style={{ padding: 0 }}>
            <div style={{ padding: "16px 0" }}>
              {batch.categories.map((cat) => (
                <div key={cat.id} style={{ display: "block", margin: "0 28px 16px" }}>
                  {/* Vertical Category Rail */}
                  <div
                    style={{
                      float: "left",
                      width: 24,
                      writingMode: "vertical-rl",
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      fontSize: 14,
                      fontWeight: 700,
                      color: C.ink,
                      letterSpacing: 4,
                      textAlign: "left",
                      paddingTop: 8,
                      textTransform: "uppercase",
                    }}
                  >
                    {cat.name_en}
                  </div>
                  
                  {/* Product Grid */}
                  <div
                    style={{
                      marginLeft: 40,
                      display: "flex",
                      flexWrap: "wrap",
                      alignContent: "flex-start",
                      gap: 10,
                    }}
                  >
                    {cat.items.map((item) => (
                      <ProductCard key={item.id} item={item} showEveningPrice={batch.show_evening_price} />
                    ))}
                  </div>
                  <div style={{ clear: "both" }} />
                </div>
              ))}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
