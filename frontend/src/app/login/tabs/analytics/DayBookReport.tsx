import React, { useState, useMemo } from "react";
import type { DayBookResponse } from "@/types";
import { parseUTCDate } from "@/lib/api";
import { ArrowDown, ArrowUp, Building2, Phone, User, UserCheck } from "lucide-react";
import { TableSearchBar } from "./shared";

export function DayBookReport({ data }: { data: DayBookResponse | null }) {
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAndSortedEntries = useMemo(() => {
    if (!data?.entries) return [];
    
    // First apply search filter
    let filtered = data.entries;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e => 
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.entity_name && e.entity_name.toLowerCase().includes(q)) ||
        (e.entity_phone && e.entity_phone.includes(q)) ||
        (e.reference_number && e.reference_number.toLowerCase().includes(q)) ||
        (e.entry_type && e.entry_type.replace(/_/g, " ").toLowerCase().includes(q))
      );
    }

    // Then sort
    const list = filtered.map((entry, originalIndex) => ({ entry, originalIndex }));
    list.sort((a, b) => {
      const timeA = new Date(a.entry.timestamp).getTime();
      const timeB = new Date(b.entry.timestamp).getTime();
      if (timeA !== timeB) {
        return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
      }
      return sortOrder === "desc" ? b.originalIndex - a.originalIndex : a.originalIndex - b.originalIndex;
    });
    return list.map((item) => item.entry);
  }, [data?.entries, sortOrder, searchQuery]);

  if (!data) return <div className="p-8 text-center text-sm text-[var(--text-muted)]">No day book data.</div>;
  
  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Physical Cash Drawer Section */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 shadow-xs">
           <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20 mb-3">
             <p className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-bold tracking-wider">Physical Cash Drawer</p>
             <span className="text-xs text-[var(--text-muted)]">Register In-Hand</span>
           </div>
           <div className="grid grid-cols-3 gap-2 text-center mb-3">
             <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
               <span className="text-[10px] text-[var(--text-muted)] uppercase block font-semibold">Opening</span>
               <span className="text-sm font-bold font-mono text-[var(--text-primary)]">₹{data.opening_cash.toFixed(2)}</span>
             </div>
             <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
               <span className="text-[10px] text-emerald-500 uppercase block font-semibold">Cash Sales</span>
               <span className="text-sm font-bold font-mono text-emerald-500">+₹{(data.cash_sales ?? 0).toFixed(2)}</span>
             </div>
             <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
               <span className="text-[10px] text-rose-500 uppercase block font-semibold">Cash Refunds</span>
               <span className="text-sm font-bold font-mono text-rose-500">-₹{(data.cash_refunds ?? 0).toFixed(2)}</span>
             </div>
           </div>
           <div className="flex items-baseline justify-between pt-2 border-t border-emerald-500/20">
             <span className="text-xs font-semibold text-[var(--text-secondary)]">Closing Cash in Drawer:</span>
             <span className="text-2xl font-black text-emerald-500 font-mono">₹{(data.closing_cash ?? data.closing_balance).toFixed(2)}</span>
           </div>
        </div>

        {/* Day Trading & Flow Summary */}
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5 shadow-xs">
           <div className="flex items-center justify-between pb-2 border-b border-sky-500/20 mb-3">
             <p className="text-xs text-sky-600 dark:text-sky-400 uppercase font-bold tracking-wider">Day Trading & Total Inflow/Outflow</p>
             <span className="text-xs text-[var(--text-muted)]">All Payment Modes & Purchases</span>
           </div>
           <div className="grid grid-cols-2 gap-2 text-center mb-3">
             <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
               <span className="text-[10px] text-emerald-500 uppercase block font-semibold">Total Inflow</span>
               <span className="text-sm font-bold font-mono text-emerald-500">
                 +₹{(data.total_cash_in + data.total_sales + (data.total_purchase_returns || 0)).toFixed(2)}
               </span>
             </div>
             <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
               <span className="text-[10px] text-rose-500 uppercase block font-semibold">Total Outflow</span>
               <span className="text-sm font-bold font-mono text-rose-500">
                 -₹{(data.total_cash_out + data.total_returns + (data.total_stock_intake_cost || 0)).toFixed(2)}
               </span>
             </div>
           </div>
           <div className="flex items-baseline justify-between pt-2 border-t border-sky-500/20">
             <span className="text-xs font-semibold text-[var(--text-secondary)]">Day Trading Balance:</span>
             <span className="text-2xl font-black text-sky-400 font-mono">₹{data.closing_balance.toFixed(2)}</span>
           </div>
        </div>
      </div>
      
      <TableSearchBar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        placeholder="Search description, party, ref..."
        title="Day Transactions"
      />
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--border-subtle)]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Day Transactions ({filteredAndSortedEntries.length})
          </h3>
          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] hover:border-sky-500 px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:text-sky-400 transition cursor-pointer shadow-xs"
            title={sortOrder === "desc" ? "Sorted: Latest on top (Click to view Earliest First)" : "Sorted: Earliest on top (Click to view Latest First)"}
          >
            {sortOrder === "desc" ? (
              <>
                <ArrowDown className="h-3.5 w-3.5 text-sky-400" />
                <span>Latest on Top</span>
              </>
            ) : (
              <>
                <ArrowUp className="h-3.5 w-3.5 text-sky-400" />
                <span>Earliest on Top</span>
              </>
            )}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase text-xs">
                <th className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                    className="inline-flex items-center gap-1 font-bold text-[var(--text-secondary)] hover:text-sky-400 transition cursor-pointer uppercase text-xs"
                    title="Toggle Sort Order"
                  >
                    <span>Time</span>
                    {sortOrder === "desc" ? (
                      <ArrowDown className="h-3.5 w-3.5 text-sky-400" />
                    ) : (
                      <ArrowUp className="h-3.5 w-3.5 text-sky-400" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Party / Contact</th>
                <th className="py-2.5 px-3 text-right">In (₹)</th>
                <th className="py-2.5 px-3 text-right">Out (₹)</th>
                <th className="py-2.5 px-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredAndSortedEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[var(--text-muted)]">
                    {searchQuery ? "No matching transactions found." : "No transactions recorded for this day."}
                  </td>
                </tr>
              ) : (
                filteredAndSortedEntries.map((e, idx) => (
                  <tr key={idx} className="hover:bg-[var(--bg-surface-elevated)]/40 transition">
                    <td className="py-2.5 px-3 text-[var(--text-muted)] font-mono text-xs whitespace-nowrap align-top">
                      {parseUTCDate(e.timestamp).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: true,
                      })}
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <span className="font-semibold text-[var(--text-primary)]">{e.description}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${
                          e.entry_type === "PURCHASE_RETURN"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : e.entry_type === "STOCK_INTAKE"
                            ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                            : e.entry_type === "CUSTOMER_RETURN"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : e.entry_type === "VOIDED_BILL"
                            ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                            : e.entry_type === "SALE" || e.entry_type === "EXCHANGE_SALE"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]"
                        }`}>
                          {e.entry_type.replace(/_/g, " ")}
                        </span>
                        {e.reference_number && e.reference_number !== "-" && (
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            Ref: {e.reference_number}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      {e.entity_name ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="inline-flex items-center gap-1.5">
                            {e.entity_type === "CUSTOMER" ? (
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-sky-500/10 text-sky-400 shrink-0" title="Customer">
                                <User className="h-3 w-3" />
                              </span>
                            ) : e.entity_type === "SUPPLIER" ? (
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-amber-500/10 text-amber-400 shrink-0" title="Supplier">
                                <Building2 className="h-3 w-3" />
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-purple-500/10 text-purple-400 shrink-0" title="Staff">
                                <UserCheck className="h-3 w-3" />
                              </span>
                            )}
                            <span className="font-semibold text-xs text-[var(--text-primary)]">
                              {e.entity_name}
                            </span>
                          </div>
                          {e.entity_phone ? (
                            <div className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] font-mono pl-6.5">
                              <Phone className="h-2.5 w-2.5 opacity-70" />
                              <span>{e.entity_phone}</span>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)] font-mono">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-500 align-top">
                      {e.credit > 0 ? e.credit.toFixed(2) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-500 align-top">
                      {e.debit > 0 ? e.debit.toFixed(2) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--text-primary)] align-top">
                      ₹{e.running_balance.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
