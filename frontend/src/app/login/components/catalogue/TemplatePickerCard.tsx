/**
 * TemplatePickerCard — two-card radio selector for template choice.
 */

"use client";

import React from "react";
import type { TemplateId } from "./templates/templateRegistry";

interface TemplatePickerCardProps {
  selected: TemplateId;
  onChange: (id: TemplateId) => void;
}

const TEMPLATES: { id: TemplateId; name: string; desc: string; palette: string[] }[] = [
  {
    id: "mandi-ledger",
    name: "Mandi Ledger",
    desc: "Paper-toned, serif headings, hanging tag cards with ink-stamp discount badges. Best for daily rate lists.",
    palette: ["#1F3D2B", "#F4EEDD", "#E0A03B", "#AD3A2C"],
  },
  /* 
  {
    id: "aisle-grid",
    name: "Aisle Grid",
    desc: "Clean white layout, colored aisle rail labels, rounded cards with accent badge chips. Best for flyers.",
    palette: ["#1B6B45", "#FAFAF6", "#C1613D", "#7C4B72", "#D64545"],
  },
  */
];

export function TemplatePickerCard({ selected, onChange }: TemplatePickerCardProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {TEMPLATES.map((tpl) => {
        const isActive = selected === tpl.id;
        return (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onChange(tpl.id)}
            className={`rounded-xl border-2 p-3 text-left transition-all cursor-pointer ${
              isActive
                ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/5 shadow-md"
                : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]"
            }`}
          >
            {/* Mini palette preview */}
            <div className="flex gap-1 mb-2">
              {tpl.palette.map((color, i) => (
                <div
                  key={i}
                  style={{ background: color }}
                  className="w-4 h-4 rounded-full border border-black/10"
                />
              ))}
            </div>

            <div className="text-xs font-bold text-[var(--text-primary)]">{tpl.name}</div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-snug">{tpl.desc}</div>

            {isActive && (
              <div className="mt-2 inline-block rounded-full bg-[var(--accent-brand)] px-2 py-0.5 text-[9px] font-bold text-[var(--text-on-accent)]">
                Selected
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
