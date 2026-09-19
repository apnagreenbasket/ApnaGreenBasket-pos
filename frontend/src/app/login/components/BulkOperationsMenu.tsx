"use client";

import React, { useState, useRef, useEffect } from "react";
import { Download, Upload, FileText, FileSpreadsheet, ChevronDown, CheckCircle2, AlertTriangle, X } from "lucide-react";

interface BulkOperationsMenuProps {
  entity: "inventory" | "menu-items" | "customers";
  authToken?: string;
  onSuccess?: () => void;
}

export function BulkOperationsMenu({ entity, authToken, onSuccess }: BulkOperationsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Modal State
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: "success" | "error";
    title: string;
    message: React.ReactNode;
  }>({
    isOpen: false,
    type: "success",
    title: "",
    message: null
  });
  
  const entityDisplayNames = {
    inventory: "Inventory",
    "menu-items": "Products",
    customers: "Customers"
  };

  // Close modal on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalState(prev => ({ ...prev, isOpen: false }));
    };
    if (modalState.isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [modalState.isOpen]);

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch(`/api/admin/bulk/templates/${entity}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!res.ok) throw new Error("Failed to download template");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = entity === "inventory" ? "xlsx" : "csv";
      a.download = `${entity}_template.${ext}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setModalState({
        isOpen: true,
        type: "error",
        title: "Download Failed",
        message: "There was an error downloading the template. Please try again."
      });
    }
  };

  const handleExport = async (format: "csv" | "excel" | "pdf") => {
    try {
      const res = await fetch(`/api/admin/bulk/${entity}/export?format=${format}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!res.ok) throw new Error("Failed to export data");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "excel" ? "xlsx" : format;
      a.download = `${entity}_export.${ext}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setModalState({
        isOpen: true,
        type: "error",
        title: "Export Failed",
        message: "There was an error exporting the data. Please try again."
      });
    }
    setIsOpen(false);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/admin/bulk/${entity}/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to import data");
      }

      const result = await res.json();
      setModalState({
        isOpen: true,
        type: "success",
        title: "Import Successful",
        message: (
          <div className="space-y-1">
            <p className="flex justify-between"><span>Records Created:</span> <span className="font-mono font-bold">{result.created}</span></p>
            <p className="flex justify-between"><span>Records Updated:</span> <span className="font-mono font-bold text-emerald-600">{result.updated}</span></p>
            <p className="flex justify-between"><span>Rows Skipped:</span> <span className="font-mono font-bold text-rose-500">{result.skipped}</span></p>
            {result.errors && result.errors.length > 0 && (
              <div className="mt-3 text-xs text-rose-500 bg-rose-50 p-2 rounded-lg max-h-32 overflow-y-auto">
                <p className="font-bold mb-1">Errors Details:</p>
                {result.errors.map((err: any, i: number) => (
                  <p key={i}>Row {err.row}: {err.message}</p>
                ))}
              </div>
            )}
          </div>
        )
      });
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setModalState({
        isOpen: true,
        type: "error",
        title: "Import Failed",
        message: err.message || "An unexpected error occurred during the import process."
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsOpen(false);
    }
  };

  return (
    <>
      <div className="relative">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".csv, .xlsx, .xls" 
        className="hidden" 
      />
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)]"
      >
        <Upload className="h-4 w-4" />
        <Download className="h-4 w-4 -ml-1" />
        Bulk Actions
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 top-full mt-2 w-56 z-50 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Import {entityDisplayNames[entity]}
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] flex items-center gap-2"
            >
              <FileText className="h-4 w-4 text-[var(--text-secondary)]" />
              Download Template
            </button>
            <button
              onClick={handleImport}
              disabled={isUploading}
              className="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] flex items-center gap-2"
            >
              <Upload className="h-4 w-4 text-[var(--text-secondary)]" />
              {isUploading ? "Uploading..." : "Upload CSV / Excel"}
            </button>

            <div className="my-1 border-t border-[var(--border-subtle)]" />
            
            <div className="px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Export {entityDisplayNames[entity]}
            </div>
            <button
              onClick={() => handleExport("excel")}
              className="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] flex items-center gap-2"
            >
              <FileSpreadsheet className="h-4 w-4 text-[var(--text-secondary)]" />
              Export as Excel
            </button>
            <button
              onClick={() => handleExport("csv")}
              className="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] flex items-center gap-2"
            >
              <FileText className="h-4 w-4 text-[var(--text-secondary)]" />
              Export as CSV
            </button>
            <button
              onClick={() => handleExport("pdf")}
              className="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] flex items-center gap-2"
            >
              <FileText className="h-4 w-4 text-[var(--text-secondary)]" />
              Export as PDF
            </button>
          </div>
        </>
      )}
      </div>

      {/* Result Modal */}
      {modalState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-sm overflow-hidden rounded-3xl bg-[var(--bg-surface)] shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
              <div className="flex items-center gap-3">
                {modalState.type === "success" ? (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/15">
                    <AlertTriangle className="h-5 w-5 text-rose-600" />
                  </div>
                )}
                <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">{modalState.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                className="rounded-full p-2 hover:bg-[var(--bg-surface-elevated)] transition text-[var(--text-muted)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="text-sm text-[var(--text-secondary)]">{modalState.message}</div>
            </div>
            <div className="flex items-center justify-end gap-3 bg-[var(--bg-surface-elevated)] px-6 py-4">
              <button
                type="button"
                onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                className={`rounded-xl px-5 py-2 text-sm font-bold text-white shadow-xs transition ${
                  modalState.type === "error"
                    ? "bg-rose-500 hover:bg-rose-600"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                Okay
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
