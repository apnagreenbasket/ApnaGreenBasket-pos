import React, { useState, useMemo } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  User,
  History,
  Receipt,
  ArrowDownRight,
  ArrowUpRight,
  Filter,
  Eye,
  Loader2,
  X,
  Clock,
  CreditCard,
  Package,
  Download,
  Wallet,
} from "lucide-react";
import type { CreditDebitReportResponse, CustomerLedgerEntry, CreditDebitTransactionRow, ManualBill } from "@/types";
import { apiRequest } from "../../adminUtils";
import { parseUTCDate } from "@/lib/api";
import { generateReceiptPDF } from "@/lib/pdfGenerator";
import { generateA4InvoicePDF } from "@/lib/invoiceGenerator";
import type { RestaurantProfile } from "../../adminTypes";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";

type CreditDebitReportProps = {
  data: CreditDebitReportResponse | null;
  isLoading?: boolean;
  restaurant?: RestaurantProfile | null;
};

function formatEntryBadge(type: string) {
  switch (type) {
    case "DEBIT_ADDED":
      return {
        label: "Udhaar / Shortfall",
        classes: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
        isNegative: true,
      };
    case "DEBIT_SETTLED":
      return {
        label: "Debt Settled",
        classes: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        isNegative: false,
      };
    case "CREDIT_ADDED":
      return {
        label: "Credit Awarded",
        classes: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
        isNegative: false,
      };
    case "CREDIT_APPLIED":
    case "CREDIT_USED":
      return {
        label: "Credit Used",
        classes: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
        isNegative: true,
      };
    case "CREDIT_CASHED_OUT":
      return {
        label: "Credit Cashed Out",
        classes: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
        isNegative: true,
      };
    default:
      return {
        label: type.replace(/_/g, " "),
        classes: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
        isNegative: false,
      };
  }
}

export function CreditDebitReport({ data, isLoading, restaurant }: CreditDebitReportProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Transactions ledger filter & search state
  const [txTypeFilter, setTxTypeFilter] = useState<"ALL" | "DEBIT_ADDED" | "DEBIT_SETTLED" | "CREDIT_ADDED" | "CREDIT_USED" | "CREDIT_CASHED_OUT">("ALL");

  // Detailed Bill Modal View state
  const [selectedBillForView, setSelectedBillForView] = useState<{
    detail: ManualBill | null;
    loading: boolean;
    error?: string | null;
    orderId: string;
  } | null>(null);
  const [fetchingBillId, setFetchingBillId] = useState<string | null>(null);

  const handleOpenBillView = async (orderId: string) => {
    setFetchingBillId(orderId);
    setSelectedBillForView({
      detail: null,
      loading: true,
      error: null,
      orderId,
    });
    try {
      const detail = await apiRequest<ManualBill>(`/api/billing/bills/${orderId}`);
      setSelectedBillForView({
        detail,
        loading: false,
        error: null,
        orderId,
      });
    } catch (err: any) {
      setSelectedBillForView({
        detail: null,
        loading: false,
        error: err?.message || "Failed to load bill details.",
        orderId,
      });
    } finally {
      setFetchingBillId(null);
    }
  };

  const handleViewReceiptPdf = () => {
    if (!selectedBillForView?.detail) return;
    generateReceiptPDF(
      selectedBillForView.detail as any,
      restaurant?.name || "ApnaGreen Basket",
      undefined,
      restaurant || {},
      "view"
    );
  };

  const handleDownloadReceiptPdf = () => {
    if (!selectedBillForView?.detail) return;
    generateReceiptPDF(
      selectedBillForView.detail as any,
      restaurant?.name || "ApnaGreen Basket",
      undefined,
      restaurant || {},
      "download"
    );
  };

  const handleDownloadInvoicePdf = () => {
    if (!selectedBillForView?.detail) return;
    generateA4InvoicePDF(
      selectedBillForView.detail as any,
      restaurant?.name || "ApnaGreen Basket",
      undefined,
      restaurant || {},
      "download"
    );
  };

  const formatBillLabel = (orderId?: string | null, basketNumber?: string | null) => {
    if (basketNumber && !basketNumber.toUpperCase().includes("WALK")) {
      return `Bill #${basketNumber}`;
    }
    if (orderId) {
      return `Bill #${orderId.slice(0, 8).toUpperCase()}`;
    }
    if (basketNumber) {
      return `Bill #${basketNumber}`;
    }
    return "Direct";
  };

  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading credit / debit data...</div>;
  }
  if (!data) return null;

  const handleExpandCustomer = async (customerId: string) => {
    if (expandedCustomerId === customerId) {
      setExpandedCustomerId(null);
      return;
    }
    setExpandedCustomerId(customerId);
    setLoadingLedger(true);
    try {
      const res = await apiRequest<CustomerLedgerEntry[]>(`/api/admin/customers/${customerId}/ledger`);
      setLedgerEntries(res);
    } catch (err) {
      console.error("Error fetching ledger", err);
    } finally {
      setLoadingLedger(false);
    }
  };

  const {
    searchQuery: cbSearchQuery,
    setSearchQuery: setCbSearchQuery,
    sortConfig: cbSortConfig,
    handleSort: handleCbSort,
    sortedAndFilteredData: sortedCustomers
  } = useTableSortAndSearch(data.customers || [], ["customer_name", "customer_phone"]);

  const rawTransactions = data.transactions || [];
  const typeFilteredTransactions = rawTransactions.filter((tx) => {
    if (txTypeFilter === "DEBIT_ADDED" && tx.entry_type !== "DEBIT_ADDED") return false;
    if (txTypeFilter === "DEBIT_SETTLED" && tx.entry_type !== "DEBIT_SETTLED") return false;
    if (txTypeFilter === "CREDIT_ADDED" && tx.entry_type !== "CREDIT_ADDED") return false;
    if (txTypeFilter === "CREDIT_USED" && !["CREDIT_APPLIED", "CREDIT_USED"].includes(tx.entry_type)) return false;
    if (txTypeFilter === "CREDIT_CASHED_OUT" && tx.entry_type !== "CREDIT_CASHED_OUT") return false;
    return true;
  });

  const {
    searchQuery: txSearchQuery,
    setSearchQuery: setTxSearchQuery,
    sortConfig: txSortConfig,
    handleSort: handleTxSort,
    sortedAndFilteredData: sortedTransactions
  } = useTableSortAndSearch(typeFilteredTransactions, ["customer_name", "customer_phone", "note", "order_basket_number", "staff_name"]);

  const periodStats = useMemo(() => {
    let totalInflow = 0;
    let totalOutflow = 0;
    let debtSettled = 0;
    let udhaarTaken = 0;
    let creditAdded = 0;
    let creditUsed = 0;
    let creditCashedOut = 0;

    rawTransactions.forEach((tx) => {
      const amt = Math.abs(tx.amount || 0);
      const type = tx.entry_type;
      if (type === "DEBIT_SETTLED") {
        debtSettled += amt;
        totalInflow += amt;
      } else if (type === "CREDIT_ADDED") {
        creditAdded += amt;
        totalInflow += amt;
      } else if (type === "DEBIT_ADDED") {
        udhaarTaken += amt;
        totalOutflow += amt;
      } else if (type === "CREDIT_APPLIED" || type === "CREDIT_USED") {
        creditUsed += amt;
        totalOutflow += amt;
      } else if (type === "CREDIT_CASHED_OUT") {
        creditCashedOut += amt;
        totalOutflow += amt;
      }
    });

    const netMovement = totalInflow - totalOutflow;
    const grossVolume = totalInflow + totalOutflow;

    return {
      totalInflow,
      totalOutflow,
      debtSettled,
      udhaarTaken,
      creditAdded,
      creditUsed,
      creditCashedOut,
      netMovement,
      grossVolume,
      count: rawTransactions.length,
    };
  }, [rawTransactions]);

  const filteredStats = useMemo(() => {
    let totalInflow = 0;
    let totalOutflow = 0;
    let debtSettled = 0;
    let udhaarTaken = 0;
    let creditAdded = 0;
    let creditUsed = 0;
    let creditCashedOut = 0;
    const uniqueCustomers = new Set<string>();

    sortedTransactions.forEach((tx) => {
      if (tx.customer_id) uniqueCustomers.add(tx.customer_id);
      const amt = Math.abs(tx.amount || 0);
      const type = tx.entry_type;
      if (type === "DEBIT_SETTLED") {
        debtSettled += amt;
        totalInflow += amt;
      } else if (type === "CREDIT_ADDED") {
        creditAdded += amt;
        totalInflow += amt;
      } else if (type === "DEBIT_ADDED") {
        udhaarTaken += amt;
        totalOutflow += amt;
      } else if (type === "CREDIT_APPLIED" || type === "CREDIT_USED") {
        creditUsed += amt;
        totalOutflow += amt;
      } else if (type === "CREDIT_CASHED_OUT") {
        creditCashedOut += amt;
        totalOutflow += amt;
      }
    });

    const netMovement = totalInflow - totalOutflow;
    const grossVolume = totalInflow + totalOutflow;

    return {
      totalInflow,
      totalOutflow,
      debtSettled,
      udhaarTaken,
      creditAdded,
      creditUsed,
      creditCashedOut,
      netMovement,
      grossVolume,
      count: sortedTransactions.length,
      uniqueCustomersCount: uniqueCustomers.size,
    };
  }, [sortedTransactions]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-1">Total Outstanding Credit</div>
          <div className="text-2xl font-black font-mono text-emerald-500">₹{data.summary.total_outstanding_credit.toFixed(2)}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1">Store owes to {data.summary.customers_with_credit} customers</div>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-red-500 mb-1">Total Outstanding Debit</div>
          <div className="text-2xl font-black font-mono text-red-500">₹{data.summary.total_outstanding_debit.toFixed(2)}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1">{data.summary.customers_with_debit} customers owe the store</div>
        </div>
        <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Total Customers w/ Balance</div>
          <div className="text-2xl font-black font-mono text-[var(--text-primary)]">{data.summary.customers_with_credit + data.summary.customers_with_debit}</div>
        </div>
        <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Ledger Transactions in Period</div>
          <div className="text-2xl font-black font-mono text-[var(--text-primary)]">{data.summary.total_transactions}</div>
        </div>
        <div className={`rounded-xl border p-4 transition-all shadow-xs ${
          periodStats.netMovement > 0
            ? "border-emerald-500/20 bg-emerald-500/5"
            : periodStats.netMovement < 0
            ? "border-rose-500/20 bg-rose-500/5"
            : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)]"
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              periodStats.netMovement > 0
                ? "text-emerald-400"
                : periodStats.netMovement < 0
                ? "text-rose-400"
                : "text-[var(--text-muted)]"
            }`}>
              Net Ledger Flow
            </span>
            {periodStats.netMovement > 0 ? (
              <span className="p-0.5 rounded bg-emerald-500/10 text-emerald-400">
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            ) : periodStats.netMovement < 0 ? (
              <span className="p-0.5 rounded bg-rose-500/10 text-rose-400">
                <ArrowDownRight className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </div>
          <div className={`text-2xl font-black font-mono ${
            periodStats.netMovement > 0
              ? "text-emerald-400"
              : periodStats.netMovement < 0
              ? "text-rose-400"
              : "text-[var(--text-primary)]"
          }`}>
            {periodStats.netMovement > 0 ? "+" : periodStats.netMovement < 0 ? "-" : ""}
            ₹{Math.abs(periodStats.netMovement).toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1 truncate" title={`Inflow: +₹${periodStats.totalInflow.toFixed(2)} • Outflow: -₹${periodStats.totalOutflow.toFixed(2)} • Total Volume: ₹${periodStats.grossVolume.toFixed(2)}`}>
            {periodStats.count === 0
              ? "No ledger activity in period"
              : `+₹${periodStats.totalInflow.toFixed(2)} in • -₹${periodStats.totalOutflow.toFixed(2)} out`}
          </div>
        </div>
      </div>

      {/* Customer Balances Table */}
      <TableSearchBar 
        searchQuery={cbSearchQuery}
        setSearchQuery={setCbSearchQuery}
        placeholder="Search by name or phone..."
        title="Customer Balances"
      />
      <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)]">

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface)] text-[10px] uppercase font-bold text-[var(--text-muted)]">
              <tr>
                <th className="p-3 w-8"></th>
                <SortableHeader label="Customer" columnKey="customer_name" sortConfig={cbSortConfig} handleSort={handleCbSort} className="!p-3" />
                <SortableHeader label="Credit Balance" columnKey="credit_balance" sortConfig={cbSortConfig} handleSort={handleCbSort} className="!p-3 text-right" />
                <SortableHeader label="Credit Given (Period)" columnKey="total_credit_given" sortConfig={cbSortConfig} handleSort={handleCbSort} className="!p-3 text-right" />
                <SortableHeader label="Debit Recorded (Period)" columnKey="total_debit_recorded" sortConfig={cbSortConfig} handleSort={handleCbSort} className="!p-3 text-right" />
                <SortableHeader label="Last Transaction" columnKey="last_transaction_date" sortConfig={cbSortConfig} handleSort={handleCbSort} className="!p-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[var(--text-muted)]">
                    {cbSearchQuery ? "No matching customers found." : "No customers found."}
                  </td>
                </tr>
              ) : (
                sortedCustomers.map((c) => (
                  <React.Fragment key={c.customer_id}>
                    <tr 
                      className={`hover:bg-[var(--bg-surface)] cursor-pointer transition ${expandedCustomerId === c.customer_id ? 'bg-[var(--bg-surface)]' : ''}`}
                      onClick={() => handleExpandCustomer(c.customer_id)}
                    >
                      <td className="p-3 text-[var(--text-muted)]">
                        {expandedCustomerId === c.customer_id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-slate-500/10 flex items-center justify-center text-slate-400">
                            <User className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-[var(--text-primary)]">{c.customer_name}</div>
                            <div className="text-[10px] font-mono text-[var(--text-muted)]">{c.customer_phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                          c.credit_balance > 0 ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 
                          c.credit_balance < 0 ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 
                          'text-[var(--text-muted)]'
                        }`}>
                          {c.credit_balance === 0 ? '₹0.00' : (c.credit_balance > 0 ? `+₹${c.credit_balance.toFixed(2)}` : `-₹${Math.abs(c.credit_balance).toFixed(2)}`)}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-[var(--text-primary)]">
                        ₹{c.total_credit_given.toFixed(2)}
                      </td>
                      <td className="p-3 text-right font-mono text-[var(--text-primary)]">
                        ₹{c.total_debit_recorded.toFixed(2)}
                      </td>
                      <td className="p-3 text-right text-[10px] text-[var(--text-muted)]">
                        {c.last_transaction_date ? parseUTCDate(c.last_transaction_date).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                    
                    {expandedCustomerId === c.customer_id && (
                      <tr className="bg-[var(--bg-surface)] border-b border-[var(--border-strong)]">
                        <td colSpan={6} className="p-0">
                          <div className="p-4 pl-12">
                            <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                              <div className="bg-[var(--bg-surface-elevated)] p-2 text-[10px] font-bold uppercase text-[var(--text-muted)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                                <span>Customer Transaction Ledger</span>
                                {loadingLedger && <span className="text-sky-500 animate-pulse">Loading...</span>}
                              </div>
                              <table className="w-full text-left text-[11px]">
                                <thead className="bg-[var(--bg-surface)] text-[9px] uppercase text-[var(--text-muted)]">
                                  <tr>
                                    <th className="p-2">Date</th>
                                    <th className="p-2">Type</th>
                                    <th className="p-2">Note</th>
                                    <th className="p-2">Bill / Source</th>
                                    <th className="p-2 text-right">Amount</th>
                                    <th className="p-2 text-right">Balance After</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                                  {!loadingLedger && ledgerEntries.length === 0 && (
                                    <tr><td colSpan={6} className="p-4 text-center font-sans text-[var(--text-muted)]">No transactions found</td></tr>
                                  )}
                                  {!loadingLedger && ledgerEntries.map(entry => {
                                    const badge = formatEntryBadge(entry.entry_type);
                                    return (
                                      <tr key={entry.id} className="hover:bg-[var(--bg-surface-elevated)]">
                                        <td className="p-2">{parseUTCDate(entry.created_at).toLocaleString()}</td>
                                        <td className="p-2">
                                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${badge.classes}`}>
                                            {badge.label}
                                          </span>
                                        </td>
                                        <td className="p-2 font-sans truncate max-w-[200px] text-[var(--text-secondary)]">{entry.note || '-'}</td>
                                        <td className="p-2 whitespace-nowrap">
                                          {entry.order_id ? (
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleOpenBillView(entry.order_id!);
                                                }}
                                                className="font-bold text-sky-400 hover:text-sky-300 hover:underline transition font-mono cursor-pointer"
                                                title="View Bill Details"
                                              >
                                                {formatBillLabel(entry.order_id, entry.order_basket_number)}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleOpenBillView(entry.order_id!);
                                                }}
                                                disabled={fetchingBillId === entry.order_id}
                                                className="p-1 rounded-md bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/20 transition cursor-pointer disabled:opacity-50 inline-flex items-center justify-center"
                                                title="View Bill Receipt"
                                              >
                                                {fetchingBillId === entry.order_id ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <Eye className="h-3 w-3" />
                                                )}
                                              </button>
                                            </div>
                                          ) : (
                                            <span className="text-[var(--text-muted)] font-mono">
                                              {formatBillLabel(null, entry.order_basket_number)}
                                            </span>
                                          )}
                                        </td>
                                        <td className={`p-2 text-right font-bold ${badge.isNegative ? 'text-rose-400' : 'text-emerald-400'}`}>
                                          {badge.isNegative ? '-' : '+'}₹{Math.abs(entry.amount).toFixed(2)}
                                        </td>
                                        <td className={`p-2 text-right font-bold ${
                                          entry.balance_after < 0 ? 'text-rose-400' : entry.balance_after > 0 ? 'text-emerald-400' : 'text-[var(--text-muted)]'
                                        }`}>
                                          {entry.balance_after < 0 ? `-₹${Math.abs(entry.balance_after).toFixed(2)}` : `₹${entry.balance_after.toFixed(2)}`}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                {ledgerEntries.length > 0 && (
                                  <tfoot className="bg-[var(--bg-surface)] border-t border-[var(--border-strong)] font-mono font-bold text-[11px]">
                                    <tr>
                                      <td className="p-2 text-[10px] font-sans uppercase font-bold text-[var(--text-muted)]">
                                        Total Movement
                                      </td>
                                      <td colSpan={3} className="p-2 text-[10px] font-sans text-[var(--text-muted)] font-normal">
                                        {ledgerEntries.length} transaction{ledgerEntries.length === 1 ? "" : "s"}
                                      </td>
                                      <td className={`p-2 text-right font-bold ${
                                        (() => {
                                          const net = ledgerEntries.reduce((acc, e) => {
                                            const isNeg = ["DEBIT_ADDED", "CREDIT_APPLIED", "CREDIT_USED", "CREDIT_CASHED_OUT"].includes(e.entry_type);
                                            return acc + (isNeg ? -Math.abs(e.amount) : Math.abs(e.amount));
                                          }, 0);
                                          return net > 0 ? "text-emerald-400" : net < 0 ? "text-rose-400" : "text-[var(--text-primary)]";
                                        })()
                                      }`}>
                                        {(() => {
                                          const net = ledgerEntries.reduce((acc, e) => {
                                            const isNeg = ["DEBIT_ADDED", "CREDIT_APPLIED", "CREDIT_USED", "CREDIT_CASHED_OUT"].includes(e.entry_type);
                                            return acc + (isNeg ? -Math.abs(e.amount) : Math.abs(e.amount));
                                          }, 0);
                                          return `${net > 0 ? "+" : net < 0 ? "-" : ""}₹${Math.abs(net).toFixed(2)}`;
                                        })()}
                                      </td>
                                      <td className="p-2 text-right text-[10px] text-[var(--text-muted)]">
                                        —
                                      </td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Credit & Debit Ledger Transactions */}
      <TableSearchBar 
        searchQuery={txSearchQuery}
        setSearchQuery={setTxSearchQuery}
        placeholder="Filter by customer, phone, note, bill..."
        title="Credit & Debit Ledger Transactions"
      />
      <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)]">
        <div className="p-4 border-b border-[var(--border-subtle)] space-y-3">

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3" /> Type:
            </span>
            {[
              { id: "ALL", label: `All (${rawTransactions.length})` },
              { id: "DEBIT_ADDED", label: "Udhaar / Shortfalls" },
              { id: "DEBIT_SETTLED", label: "Debt Settled" },
              { id: "CREDIT_ADDED", label: "Store Credit Added" },
              { id: "CREDIT_USED", label: "Credit Used" },
              { id: "CREDIT_CASHED_OUT", label: "Credit Cashed Out" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTxTypeFilter(f.id as any)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                  txTypeFilter === f.id
                    ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-sm"
                    : "bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface)] text-[10px] uppercase font-bold text-[var(--text-muted)]">
              <tr>
                <SortableHeader label="Date & Time" columnKey="created_at" sortConfig={txSortConfig} handleSort={handleTxSort} className="!p-3" />
                <SortableHeader label="Customer" columnKey="customer_name" sortConfig={txSortConfig} handleSort={handleTxSort} className="!p-3" />
                <SortableHeader label="Type" columnKey="entry_type" sortConfig={txSortConfig} handleSort={handleTxSort} className="!p-3" />
                <SortableHeader label="Bill / Source" columnKey="order_basket_number" sortConfig={txSortConfig} handleSort={handleTxSort} className="!p-3" />
                <SortableHeader label="Amount" columnKey="amount" sortConfig={txSortConfig} handleSort={handleTxSort} className="!p-3 text-right" />
                <SortableHeader label="Balance After" columnKey="balance_after" sortConfig={txSortConfig} handleSort={handleTxSort} className="!p-3 text-right" />
                <SortableHeader label="Note / Details" columnKey="note" sortConfig={txSortConfig} handleSort={handleTxSort} className="!p-3" />
                <SortableHeader label="Staff" columnKey="staff_name" sortConfig={txSortConfig} handleSort={handleTxSort} className="!p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-[var(--text-muted)] font-sans">
                    <Receipt className="h-8 w-8 mx-auto opacity-30 mb-2" />
                    <div className="font-medium">{txSearchQuery ? "No matching transactions found." : "No credit/debit transactions recorded in this period."}</div>
                    {!txSearchQuery && <div className="text-[11px] opacity-70 mt-1">Transactions will appear when customer udhaar, credit awards, or payments are processed.</div>}
                  </td>
                </tr>
              ) : (
                sortedTransactions.map((tx) => {
                  const badge = formatEntryBadge(tx.entry_type);
                  return (
                    <tr key={tx.id} className="hover:bg-[var(--bg-surface)] transition">
                      <td className="p-3 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                        {tx.created_at ? parseUTCDate(tx.created_at).toLocaleString() : "-"}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-[var(--text-primary)]">{tx.customer_name}</div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)]">{tx.customer_phone}</div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${badge.classes}`}>
                          {badge.isNegative ? (
                            <ArrowDownRight className="h-3 w-3" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3" />
                          )}
                          <span>{badge.label}</span>
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[11px] whitespace-nowrap">
                        {tx.order_id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenBillView(tx.order_id!);
                              }}
                              className="font-bold text-sky-400 hover:text-sky-300 hover:underline transition font-mono cursor-pointer"
                              title="View Bill Details"
                            >
                              {formatBillLabel(tx.order_id, tx.order_basket_number)}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenBillView(tx.order_id!);
                              }}
                              disabled={fetchingBillId === tx.order_id}
                              className="p-1 rounded-md bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/20 transition cursor-pointer disabled:opacity-50 inline-flex items-center justify-center"
                              title="View Bill Receipt"
                            >
                              {fetchingBillId === tx.order_id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        ) : tx.order_basket_number && !tx.order_basket_number.toUpperCase().includes("WALK") ? (
                          <span className="text-sky-400 font-bold">Bill #{tx.order_basket_number}</span>
                        ) : (
                          <span className="text-[var(--text-muted)] italic">Direct / Return</span>
                        )}
                      </td>
                      <td className={`p-3 text-right font-mono font-bold text-sm ${badge.isNegative ? "text-rose-400" : "text-emerald-400"}`}>
                        {badge.isNegative ? "-" : "+"}₹{Math.abs(tx.amount).toFixed(2)}
                      </td>
                      <td className={`p-3 text-right font-mono font-bold text-xs ${
                        tx.balance_after < 0
                          ? "text-rose-400"
                          : tx.balance_after > 0
                          ? "text-emerald-400"
                          : "text-[var(--text-muted)]"
                      }`}>
                        {tx.balance_after < 0
                          ? `-₹${Math.abs(tx.balance_after).toFixed(2)}`
                          : `₹${tx.balance_after.toFixed(2)}`}
                      </td>
                      <td className="p-3 text-[11px] text-[var(--text-secondary)] max-w-xs truncate" title={tx.note || ""}>
                        {tx.note || "-"}
                      </td>
                      <td className="p-3 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                        {tx.staff_name || "System"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {sortedTransactions.length > 0 && (
              <tfoot className="bg-[var(--bg-surface)] border-t-2 border-[var(--border-strong)] text-xs font-bold divide-y divide-[var(--border-subtle)]">
                <tr>
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-black text-[var(--text-primary)]">
                      <History className="h-3.5 w-3.5 text-sky-400" />
                      <span>Total Movement</span>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] font-normal block mt-0.5">
                      {filteredStats.count} transaction{filteredStats.count === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="text-[11px] font-bold text-[var(--text-primary)]">
                      {filteredStats.uniqueCustomersCount} customer{filteredStats.uniqueCustomersCount === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-0.5 text-[10px] font-mono">
                      {filteredStats.debtSettled > 0 && (
                        <span className="text-emerald-400 font-bold">
                          +₹{filteredStats.debtSettled.toFixed(2)} <span className="font-sans font-normal opacity-80">settled</span>
                        </span>
                      )}
                      {filteredStats.creditAdded > 0 && (
                        <span className="text-cyan-400 font-bold">
                          +₹{filteredStats.creditAdded.toFixed(2)} <span className="font-sans font-normal opacity-80">credit</span>
                        </span>
                      )}
                      {filteredStats.udhaarTaken > 0 && (
                        <span className="text-rose-400 font-bold">
                          -₹{filteredStats.udhaarTaken.toFixed(2)} <span className="font-sans font-normal opacity-80">udhaar</span>
                        </span>
                      )}
                      {filteredStats.creditUsed > 0 && (
                        <span className="text-amber-400 font-bold">
                          -₹{filteredStats.creditUsed.toFixed(2)} <span className="font-sans font-normal opacity-80">used</span>
                        </span>
                      )}
                      {filteredStats.creditCashedOut > 0 && (
                        <span className="text-purple-400 font-bold">
                          -₹{filteredStats.creditCashedOut.toFixed(2)} <span className="font-sans font-normal opacity-80">cashed out</span>
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-[11px] font-mono text-[var(--text-muted)] whitespace-nowrap">
                    Net Movement
                  </td>
                  <td className={`p-3 text-right font-mono font-black text-sm whitespace-nowrap ${
                    filteredStats.netMovement > 0
                      ? "text-emerald-400"
                      : filteredStats.netMovement < 0
                      ? "text-rose-400"
                      : "text-[var(--text-primary)]"
                  }`}>
                    {filteredStats.netMovement > 0 ? "+" : filteredStats.netMovement < 0 ? "-" : ""}
                    ₹{Math.abs(filteredStats.netMovement).toFixed(2)}
                  </td>
                  <td className="p-3 text-right text-[10px] text-[var(--text-muted)] font-mono">
                    —
                  </td>
                  <td className="p-3 text-[11px] text-[var(--text-secondary)]">
                    <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block">Gross Activity Volume</span>
                    <span className="font-mono font-bold text-[var(--text-primary)]">₹{filteredStats.grossVolume.toFixed(2)}</span>
                  </td>
                  <td className="p-3 text-[10px] text-[var(--text-muted)]">
                    —
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* DETAILED BILL VIEW MODAL */}
      {selectedBillForView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setSelectedBillForView(null)}
        >
          <div
            className="relative w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5 bg-[var(--bg-surface)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[var(--text-primary)]">
                      {selectedBillForView.detail?.basket_number && !selectedBillForView.detail.basket_number.toUpperCase().includes("WALK")
                        ? `Basket #${selectedBillForView.detail.basket_number}`
                        : `Bill #${(selectedBillForView.detail?.id || selectedBillForView.orderId).slice(0, 8).toUpperCase()}`}
                    </h3>
                    <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
                      {selectedBillForView.detail?.status || "SETTLED"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {selectedBillForView.detail?.created_at
                      ? parseUTCDate(selectedBillForView.detail.created_at).toLocaleString()
                      : "Loading timestamp..."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedBillForView(null)}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {selectedBillForView.loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-[var(--text-muted)]">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-400 mb-3" />
                  <p className="font-semibold text-[var(--text-primary)]">Loading Bill Details...</p>
                  <p className="mt-1">Fetching order items and payment breakdown.</p>
                </div>
              ) : selectedBillForView.error ? (
                <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-center">
                  <p className="font-semibold">{selectedBillForView.error}</p>
                </div>
              ) : selectedBillForView.detail && (
                <>
                  {/* Customer & Payment Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-[var(--text-muted)]" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Customer</span>
                        <span className="font-bold text-[var(--text-primary)]">
                          {selectedBillForView.detail.customer_name || "Walk-in Customer"}
                        </span>
                        {selectedBillForView.detail.customer_phone && (
                          <span className="text-[11px] text-[var(--text-secondary)] block font-mono">
                            {selectedBillForView.detail.customer_phone}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-[var(--text-muted)]" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Payment Mode</span>
                        <span className="font-bold text-sky-400 uppercase">
                          {selectedBillForView.detail.payment_method || "CASH"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-[var(--text-muted)]" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Items Billed</span>
                        <span className="font-bold text-[var(--text-primary)]">
                          {selectedBillForView.detail.items?.length || 0} items
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-purple-400" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                          {selectedBillForView.detail.customer_balance !== undefined && selectedBillForView.detail.customer_balance !== null
                            ? selectedBillForView.detail.customer_balance < 0
                              ? "Outstanding Debit"
                              : "Store Credit"
                            : "Customer Balance"}
                        </span>
                        <span className={`font-bold font-mono ${
                          selectedBillForView.detail.customer_balance !== undefined && selectedBillForView.detail.customer_balance !== null
                            ? selectedBillForView.detail.customer_balance < 0
                              ? "text-rose-400"
                              : selectedBillForView.detail.customer_balance > 0
                              ? "text-emerald-400"
                              : "text-[var(--text-muted)]"
                            : "text-[var(--text-muted)]"
                        }`}>
                          {selectedBillForView.detail.customer_balance !== undefined && selectedBillForView.detail.customer_balance !== null
                            ? selectedBillForView.detail.customer_balance < 0
                              ? `-₹${Math.abs(selectedBillForView.detail.customer_balance).toFixed(2)}`
                              : `₹${Number(selectedBillForView.detail.customer_balance).toFixed(2)}`
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                    <div className="p-2.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] font-bold text-xs uppercase text-[var(--text-muted)]">
                      Billed Items
                    </div>
                    <table className="w-full text-left">
                      <thead className="bg-[var(--bg-surface-elevated)] text-[10px] uppercase text-[var(--text-muted)]">
                        <tr>
                          <th className="p-2.5">Item</th>
                          <th className="p-2.5 text-center">Qty</th>
                          <th className="p-2.5 text-right">Price</th>
                          <th className="p-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-xs">
                        {selectedBillForView.detail.items?.map((it, idx) => (
                          <tr key={idx} className="hover:bg-[var(--bg-surface)]/50">
                            <td className="p-2.5 font-sans">
                              <div className="font-bold text-[var(--text-primary)]">{it.item_name}</div>
                              {it.selected_unit && (
                                <div className="text-[10px] text-[var(--text-muted)]">{it.selected_unit}</div>
                              )}
                            </td>
                            <td className="p-2.5 text-center font-bold">{it.quantity}</td>
                            <td className="p-2.5 text-right">₹{Number(it.unit_price).toFixed(2)}</td>
                            <td className="p-2.5 text-right font-bold text-[var(--text-primary)]">
                              ₹{Number(it.line_total || Number(it.unit_price) * Number(it.quantity)).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals & Tenders */}
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--text-muted)]">Subtotal:</span>
                      <span className="font-mono font-bold">₹{Number(selectedBillForView.detail.subtotal_amount || 0).toFixed(2)}</span>
                    </div>
                    {Number(selectedBillForView.detail.discount_value || 0) > 0 && (
                      <div className="flex justify-between text-xs text-emerald-500">
                        <span>Discount:</span>
                        <span className="font-mono font-bold">-₹{Number(selectedBillForView.detail.discount_value).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(selectedBillForView.detail.loyalty_discount_inr || 0) > 0 && (
                      <div className="flex justify-between text-xs text-amber-500">
                        <span>Loyalty Points Discount:</span>
                        <span className="font-mono font-bold">-₹{Number(selectedBillForView.detail.loyalty_discount_inr).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(selectedBillForView.detail.tax_amount || 0) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-muted)]">GST Tax:</span>
                        <span className="font-mono">₹{Number(selectedBillForView.detail.tax_amount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-black border-t border-[var(--border-subtle)] pt-2 text-[var(--text-primary)]">
                      <span>Grand Total:</span>
                      <span className="font-mono text-emerald-400">₹{Number(selectedBillForView.detail.total_amount || 0).toFixed(2)}</span>
                    </div>

                    {/* Tender Split Details */}
                    <div className="pt-2 border-t border-[var(--border-subtle)] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                      {Number(selectedBillForView.detail.cash_amount || 0) > 0 && (
                        <div className="bg-[var(--bg-surface-elevated)] p-2 rounded-lg border border-[var(--border-subtle)]">
                          <span className="text-[10px] font-sans text-[var(--text-muted)] block">Cash Tender</span>
                          <span className="font-bold text-[var(--text-primary)]">₹{Number(selectedBillForView.detail.cash_amount).toFixed(2)}</span>
                        </div>
                      )}
                      {Number(selectedBillForView.detail.upi_amount || 0) > 0 && (
                        <div className="bg-[var(--bg-surface-elevated)] p-2 rounded-lg border border-[var(--border-subtle)]">
                          <span className="text-[10px] font-sans text-[var(--text-muted)] block">UPI Tender</span>
                          <span className="font-bold text-sky-400">₹{Number(selectedBillForView.detail.upi_amount).toFixed(2)}</span>
                        </div>
                      )}
                      {Number(selectedBillForView.detail.credit_applied || 0) > 0 && (
                        <div className="bg-[var(--bg-surface-elevated)] p-2 rounded-lg border border-[var(--border-subtle)]">
                          <span className="text-[10px] font-sans text-[var(--text-muted)] block">Store Credit Used</span>
                          <span className="font-bold text-purple-400">₹{Number(selectedBillForView.detail.credit_applied).toFixed(2)}</span>
                        </div>
                      )}
                      {Number(selectedBillForView.detail.debit_applied || 0) > 0 && (
                        <div className="bg-[var(--bg-surface-elevated)] p-2 rounded-lg border border-[var(--border-subtle)]">
                          <span className="text-[10px] font-sans text-[var(--text-muted)] block">Udhaar (Debit)</span>
                          <span className="font-bold text-rose-400">₹{Number(selectedBillForView.detail.debit_applied).toFixed(2)}</span>
                        </div>
                      )}
                      {Number(selectedBillForView.detail.debt_settled || 0) > 0 && (
                        <div className="bg-[var(--bg-surface-elevated)] p-2 rounded-lg border border-[var(--border-subtle)]">
                          <span className="text-[10px] font-sans text-[var(--text-muted)] block">Debt Settled</span>
                          <span className="font-bold text-emerald-400">₹{Number(selectedBillForView.detail.debt_settled).toFixed(2)}</span>
                        </div>
                      )}
                      {Number(selectedBillForView.detail.credit_awarded || 0) > 0 && (
                        <div className="bg-[var(--bg-surface-elevated)] p-2 rounded-lg border border-[var(--border-subtle)]">
                          <span className="text-[10px] font-sans text-[var(--text-muted)] block">Credit Awarded</span>
                          <span className="font-bold text-cyan-400">₹{Number(selectedBillForView.detail.credit_awarded).toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    {/* Customer Balance Banner */}
                    {selectedBillForView.detail.customer_balance !== undefined && selectedBillForView.detail.customer_balance !== null && (
                      <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs font-mono ${
                        selectedBillForView.detail.customer_balance < 0
                          ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                          : selectedBillForView.detail.customer_balance > 0
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                          : "bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                      }`}>
                        <span className="font-sans font-bold flex items-center gap-1.5">
                          <Wallet className="h-3.5 w-3.5" />
                          {selectedBillForView.detail.customer_balance < 0 ? "Customer Outstanding Debit:" : "Customer Store Credit:"}
                        </span>
                        <span className="font-bold text-sm">
                          {selectedBillForView.detail.customer_balance < 0
                            ? `-₹${Math.abs(selectedBillForView.detail.customer_balance).toFixed(2)}`
                            : `₹${Number(selectedBillForView.detail.customer_balance).toFixed(2)}`}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] p-4 bg-[var(--bg-surface)]">
              <div className="flex items-center gap-2">
                {selectedBillForView.detail && (
                  <>
                    <button
                      type="button"
                      onClick={handleViewReceiptPdf}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:border-sky-500 hover:text-sky-400 transition cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5 text-sky-400" />
                      <span>View Receipt PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadReceiptPdf}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:border-emerald-500 hover:text-emerald-400 transition cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Download Bill</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadInvoicePdf}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:border-purple-500 hover:text-purple-400 transition cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5 text-purple-400" />
                      <span>Download Invoice</span>
                    </button>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedBillForView(null)}
                className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-4 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

