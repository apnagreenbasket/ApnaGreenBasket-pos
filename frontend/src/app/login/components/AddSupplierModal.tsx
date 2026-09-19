"use client";

import React, { useState, useEffect } from "react";
import { Building2, X, Plus, Phone, Mail, MapPin, Receipt, User, CreditCard, FileText, Save } from "lucide-react";
import type { Supplier } from "@/types";

interface AddSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSupplierCreated?: (newSupplier: Supplier) => void;
  createSupplier?: (data: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    gstin?: string;
    contact_person?: string;
    payment_terms?: string;
    notes?: string;
  }) => Promise<Supplier | void>;
  updateSupplier?: (supplierId: string, data: any) => Promise<Supplier | void>;
  editingSupplier?: Supplier;
}

export function AddSupplierModal({
  isOpen,
  onClose,
  onSupplierCreated,
  createSupplier,
  updateSupplier,
  editingSupplier,
}: AddSupplierModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (editingSupplier) {
        setName(editingSupplier.name || "");
        setPhone(editingSupplier.phone || "");
        setEmail(editingSupplier.email || "");
        setAddress(editingSupplier.address || "");
        setGstin(editingSupplier.gstin || "");
        setContactPerson(editingSupplier.contact_person || "");
        setPaymentTerms(editingSupplier.payment_terms || "");
        setNotes(editingSupplier.notes || "");
      } else {
        setName("");
        setPhone("");
        setEmail("");
        setAddress("");
        setGstin("");
        setContactPerson("");
        setPaymentTerms("");
        setNotes("");
      }
      setError(null);
    }
  }, [isOpen, editingSupplier]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Supplier name is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        gstin: gstin.trim() || undefined,
        contact_person: contactPerson.trim() || undefined,
        payment_terms: paymentTerms.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      if (editingSupplier && updateSupplier) {
        const updated = await updateSupplier(editingSupplier.id, payload);
        if (updated && onSupplierCreated) {
          onSupplierCreated(updated);
        }
      } else if (createSupplier) {
        const created = await createSupplier(payload);
        if (created && onSupplierCreated) {
          onSupplierCreated(created);
        }
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to create supplier.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] shadow-2xl transition-all" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {editingSupplier ? "Edit Supplier" : "Add New Supplier / Vendor"}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                {editingSupplier ? "Update supplier details" : "Register vendor for inward stock intake"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Supplier / Company Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Royal Fresh Produce Co."
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
                <Receipt className="h-3 w-3" /> GSTIN (Optional)
              </label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="27AADCB2230M1Z2"
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
                <User className="h-3 w-3" /> Contact Person (Optional)
              </label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Rahul"
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
                <Phone className="h-3 w-3" /> Phone (Optional)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email (Optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vendor@company.com"
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
              <CreditCard className="h-3 w-3" /> Payment Terms (Optional)
            </label>
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="e.g. Net 30, Cash on Delivery"
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Address / Location (Optional)
            </label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="APMC Wholesale Market, Gate No. 3..."
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-purple-500 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3" /> Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Call before arriving, only delivers on Tuesdays..."
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-purple-500 focus:outline-none resize-none"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 text-xs font-bold shadow-md transition active:scale-98 cursor-pointer disabled:opacity-50"
            >
              {editingSupplier ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              <span>{isSubmitting ? "Saving..." : editingSupplier ? "Save Changes" : "Save Supplier"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
