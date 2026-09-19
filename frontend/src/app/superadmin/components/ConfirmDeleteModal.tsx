"use client";

import React from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

type ConfirmDeleteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  itemName?: string;
  message?: string;
  isDeleting?: boolean;
};

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Deletion",
  itemName,
  message,
  isDeleting = false,
}: ConfirmDeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-3xl border border-red-500/30 bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
        {/* Header Icon */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-14 w-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">
            {title}
          </h3>
          {itemName && (
            <p className="text-xs font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-xl">
              "{itemName}"
            </p>
          )}
        </div>

        {/* Message */}
        <p className="text-xs text-[var(--text-secondary)] text-center leading-relaxed">
          {message ||
            `Are you sure you want to proceed? This will permanently delete this entity and all associated data from the platform.`}
        </p>

        {/* Warning Alert Banner */}
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-[11px] font-semibold text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span>Warning: This action is permanent and cannot be undone.</span>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2.5 px-4 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-red-500 py-2.5 px-4 text-xs font-bold text-white shadow-md hover:bg-red-600 transition disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            <span>{isDeleting ? "Deleting..." : "Delete Permanently"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
