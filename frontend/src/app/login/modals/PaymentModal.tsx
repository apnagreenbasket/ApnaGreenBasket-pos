/**
 * PaymentModal — Process Settlement Payment Modal (Cash / Direct UPI).
 *
 * Extracted from admin page.tsx (lines 6773-6973).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bookmark, Check, CheckCircle2, CreditCard, DollarSign, Loader2, Pencil, Percent, QrCode, X } from "lucide-react";
import { apiRequest } from "../adminUtils";
import React from "react";
import type { ManualBill } from "@/types";
import type { RestaurantProfile } from "../adminTypes";
import type { CustomerAnalytics } from "./CustomerInsightsModal";

type PaymentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onBackToDrawer?: () => void;
  onKeepAsDraft?: () => void;
  onDiscardBill?: () => void;
  paymentTargetBill: ManualBill | null;
  selectedPaymentMethod: "CASH" | "UPI";
  setSelectedPaymentMethod: (method: "CASH" | "UPI") => void;
  cashTendered: string;
  setCashTendered: (val: string) => void;
  handleMarkPaid: (
    cashDenominations?: Record<string, number>,
    changeDenominations?: Record<string, number>,
    redeemLoyaltyPoints?: number,
    deliveryCharge?: number,
    handlingCharge?: number,
    applyCredit?: number,
    recordDebit?: number,
    recordCredit?: number,
    debtSettled?: number,
    creditCashedOut?: number,
    cashAmount?: number,
    upiAmount?: number
  ) => Promise<void>;
  onOpenDiscountModal?: (bill: ManualBill) => void;
  restaurant?: RestaurantProfile | null;
  editingCompletedBill?: ManualBill | null;
};

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export function PaymentModal({
  isOpen,
  onClose,
  onBackToDrawer,
  onKeepAsDraft,
  onDiscardBill,
  paymentTargetBill,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  cashTendered,
  setCashTendered,
  handleMarkPaid,
  onOpenDiscountModal,
  restaurant,
  editingCompletedBill,
}: PaymentModalProps) {
  const [denomCounts, setDenomCounts] = useState<Record<number, number>>({
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
  });

  const [changeDenomCounts, setChangeDenomCounts] = useState<Record<number, number>>({
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
  });

  const [isRestUpiConfirmed, setIsRestUpiConfirmed] = useState<boolean>(false);
  const [customUpiAmount, setCustomUpiAmount] = useState<string>("");
  const [isCustomUpiEditing, setIsCustomUpiEditing] = useState<boolean>(false);
  const [directUpiCustomAmount, setDirectUpiCustomAmount] = useState<string>("");
  const [isDirectUpiEditing, setIsDirectUpiEditing] = useState<boolean>(false);
  const [customerAnalytics, setCustomerAnalytics] = useState<CustomerAnalytics | null>(null);
  const [redeemPoints, setRedeemPoints] = useState<number>(0);
  const [deliveryCharge, setDeliveryCharge] = useState<number>(0);
  const [handlingCharge, setHandlingCharge] = useState<number>(0);
  const [applyCreditAmount, setApplyCreditAmount] = useState<string>("");
  const [recordDebitAmount, setRecordDebitAmount] = useState<string>("");
  const [recordCreditAmount, setRecordCreditAmount] = useState<string>("");
  const [autoConvertCredit, setAutoConvertCredit] = useState<boolean>(false);
  const [autoRecordDebitOnShortfall, setAutoRecordDebitOnShortfall] = useState<boolean>(false);
  const [autoRecordExtraChangeAsDebt, setAutoRecordExtraChangeAsDebt] = useState<boolean>(false);
  const [settleDebit, setSettleDebit] = useState<boolean>(false);

  const [paymentEditMode, setPaymentEditMode] = useState<"ADJUST" | "FULL">("ADJUST");
  const [activeTappingMode, setActiveTappingMode] = useState<"INTAKE" | "RETURN">("INTAKE");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Fetch analytics for loyalty points
  useEffect(() => {
    if (isOpen && paymentTargetBill?.customer_phone) {
      const cleanPhone = paymentTargetBill.customer_phone.replace(/\D/g, "");
      if (cleanPhone.length >= 10) {
        apiRequest<CustomerAnalytics>(`/api/admin/customers/analytics?phone=${cleanPhone}&period=all_time`)
          .then(data => setCustomerAnalytics(data))
          .catch(() => setCustomerAnalytics(null));
      }
    } else {
      setCustomerAnalytics(null);
    }
  }, [isOpen, paymentTargetBill?.customer_phone]);

  // Bug 5 fix: Reset denomination counts and state whenever modal opens or bill changes
  useEffect(() => {
    if (isOpen) {
      setDenomCounts({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
      setChangeDenomCounts({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
      setIsRestUpiConfirmed(false);
      setCustomUpiAmount("");
      setIsCustomUpiEditing(false);
      setDirectUpiCustomAmount("");
      setIsDirectUpiEditing(false);
      setRedeemPoints(0);
      setDeliveryCharge(paymentTargetBill?.delivery_charge || 0);
      setHandlingCharge(paymentTargetBill?.handling_charge || 0);
      setApplyCreditAmount("");
      setRecordDebitAmount("");
      setRecordCreditAmount("");
      setAutoConvertCredit(false);
      setAutoRecordDebitOnShortfall(false);
      setSettleDebit(false);
      setPaymentEditMode("ADJUST");
      setActiveTappingMode("INTAKE");
      setIsSubmitting(false);
      setError(null);
    } else {
      setIsSubmitting(false);
    }
  }, [isOpen, paymentTargetBill]);


  const denomTotal = useMemo(() => {
    return Object.entries(denomCounts).reduce((sum, [d, count]) => sum + Number(d) * count, 0);
  }, [denomCounts]);

  const changeDenomTotal = useMemo(() => {
    return Object.entries(changeDenomCounts).reduce((sum, [d, count]) => sum + Number(d) * count, 0);
  }, [changeDenomCounts]);


  const targetCash = parseFloat(cashTendered) || 0;

  const subtotalAmount = useMemo(() => {
    if (!paymentTargetBill) return 0;
    if (paymentTargetBill.subtotal_amount && paymentTargetBill.subtotal_amount > 0) {
      return paymentTargetBill.subtotal_amount;
    }
    if (paymentTargetBill.items && paymentTargetBill.items.length > 0) {
      return paymentTargetBill.items.reduce((sum: number, item: any) => {
        const price = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price) || 0;
        return sum + price * (item.quantity || 1);
      }, 0);
    }
    return paymentTargetBill.total_amount || 0;
  }, [paymentTargetBill]);

  const { totalItemCount, totalQuantity } = useMemo(() => {
    const items = paymentTargetBill?.items || [];
    const count = items.length;
    const qty = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);
    return { totalItemCount: count, totalQuantity: qty };
  }, [paymentTargetBill?.items]);
  const formattedTotalQty = Number.isInteger(totalQuantity) ? totalQuantity : parseFloat(totalQuantity.toFixed(3));

  const calculatedDiscountRupees = useMemo(() => {
    if (!paymentTargetBill) return 0;
    const type = paymentTargetBill.discount_type;
    const val = paymentTargetBill.discount_value || 0;
    if (type === "PERCENT") {
      return subtotalAmount * (val / 100);
    } else if (type === "FLAT") {
      return val;
    } else if (type === "COMPLIMENTARY") {
      return subtotalAmount;
    } else if (type === "COMPLIMENTARY_ITEMS") {
      return paymentTargetBill.discount_value || 0;
    } else if (subtotalAmount > paymentTargetBill.total_amount) {
      return subtotalAmount - paymentTargetBill.total_amount;
    }
    return 0;
  }, [paymentTargetBill, subtotalAmount]);

  const grandTotalBeforeCredit = useMemo(() => {
    if (!paymentTargetBill) return 0;
    
    let base = paymentTargetBill.total_amount || 0;
    if (calculatedDiscountRupees > 0) {
      base = Math.max(0, subtotalAmount - calculatedDiscountRupees);
    }
    
    // Apply Loyalty Points Discount
    const applicableTier = (restaurant?.loyalty_redemption_tiers || []).find(t =>
      (customerAnalytics?.loyalty_points || 0) >= t.min_points &&
      (t.max_points == null || (customerAnalytics?.loyalty_points || 0) <= t.max_points)
    );
    const pointValue = applicableTier ? (applicableTier.discount_percentage / 100) : 0;
    const maxBillPercentage = parseFloat(String(restaurant?.loyalty_max_bill_percentage || "100.00"));
    
    if (redeemPoints > 0 && pointValue > 0) {
      const requestedDiscount = redeemPoints * pointValue;
      const maxAllowedDiscount = (maxBillPercentage / 100) * subtotalAmount;
      const loyaltyDiscount = Math.min(requestedDiscount, maxAllowedDiscount);
      base = Math.max(0, base - loyaltyDiscount);
    }
    
    // Apply Delivery and Handling Charges and Round Off
    base = Math.round(base + deliveryCharge + handlingCharge);
    
    return base;
  }, [paymentTargetBill, subtotalAmount, calculatedDiscountRupees, redeemPoints, deliveryCharge, handlingCharge, restaurant, customerAnalytics]);

  const grandTotal = useMemo(() => {
    let base = grandTotalBeforeCredit;

    // Apply Credit
    const creditToApply = parseFloat(applyCreditAmount) || 0;
    if (creditToApply > 0) {
      base = Math.max(0, base - creditToApply);
    }
    
    // Settle Debit (Adding owed money to current bill)
    if (settleDebit && customerAnalytics && customerAnalytics.credit_balance && customerAnalytics.credit_balance < 0) {
      base = base + Math.abs(customerAnalytics.credit_balance);
    }
    
    // Record Debit (Shortfall - reduces amount customer pays now)
    const debitToRecord = parseFloat(recordDebitAmount) || 0;
    if (debitToRecord > 0) {
      base = Math.max(0, base - debitToRecord);
    }

    return base;
  }, [paymentTargetBill, subtotalAmount, calculatedDiscountRupees, redeemPoints, deliveryCharge, handlingCharge, restaurant, applyCreditAmount, recordDebitAmount, settleDebit, customerAnalytics]);

  const adjustOldTotal = editingCompletedBill ? (editingCompletedBill.total_amount || 0) : 0;
  
  const effectiveGrandTotalForCollection = useMemo(() => {
    if (paymentEditMode === "ADJUST" && editingCompletedBill) {
      return Math.max(0, grandTotal - adjustOldTotal);
    }
    return grandTotal;
  }, [grandTotal, paymentEditMode, editingCompletedBill, adjustOldTotal]);

  const remainingNeeded = Math.max(0, effectiveGrandTotalForCollection - targetCash);

  const effectiveUpiAmount = useMemo(() => {
    if (!isRestUpiConfirmed) return 0;
    if (customUpiAmount.trim() !== "") {
      const parsed = parseFloat(customUpiAmount);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return remainingNeeded;
  }, [isRestUpiConfirmed, customUpiAmount, remainingNeeded]);

  const remainingAfterUpi = Math.max(0, remainingNeeded - effectiveUpiAmount);

  const effectiveDirectUpiAmount = useMemo(() => {
    if (directUpiCustomAmount.trim() !== "") {
      const parsed = parseFloat(directUpiCustomAmount);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return effectiveGrandTotalForCollection;
  }, [directUpiCustomAmount, effectiveGrandTotalForCollection]);

  const directUpiShortfall = Math.max(0, effectiveGrandTotalForCollection - effectiveDirectUpiAmount);
  const directUpiSurplus = Math.max(0, effectiveDirectUpiAmount - effectiveGrandTotalForCollection);

  const creditCashedOut = useMemo(() => {
    const creditToApply = parseFloat(applyCreditAmount) || 0;
    return Math.max(0, creditToApply - grandTotalBeforeCredit);
  }, [applyCreditAmount, grandTotalBeforeCredit]);


  const remainingNeededAmt = useMemo(() => {
    const target = targetCash > effectiveGrandTotalForCollection ? targetCash : effectiveGrandTotalForCollection;
    return Math.max(0, target - denomTotal);
  }, [targetCash, effectiveGrandTotalForCollection, denomTotal]);

  const smartHighlightedDenoms = useMemo(() => {
    if (remainingNeededAmt <= 0) return new Set<number>();

    const highlighted = new Set<number>();

    // Denominations above remaining, sorted smallest → largest
    const denomsAbove = [...DENOMINATIONS]
      .reverse()
      .filter((d) => d > remainingNeededAmt);

    // RULE 1: Any note ≤ remaining is ALWAYS possible (building exact change)
    DENOMINATIONS.forEach((d) => {
      if (d <= remainingNeededAmt) highlighted.add(d);
    });

    // RULE 2: For notes > remaining, allow them ONLY if they don't make previously tapped notes redundant
    denomsAbove.slice(0, 2).forEach((d) => {
      if (denomTotal === 0) {
        highlighted.add(d);
      } else {
        const resultingChange = (denomTotal + d) - effectiveGrandTotalForCollection;
        // Non-redundancy condition: change must be strictly less than denomTotal
        if (resultingChange < denomTotal) {
          highlighted.add(d);
        }
      }
    });

    return highlighted;
  }, [remainingNeededAmt, denomTotal, grandTotal]);

  const smallestSingleNoteForGrandTotal = useMemo(() => {
    return [...DENOMINATIONS].reverse().find((d) => d >= effectiveGrandTotalForCollection) || null;
  }, [effectiveGrandTotalForCollection]);

  const handleAutoTapExact = (targetAmount: number) => {
    let rem = Math.floor(targetAmount);
    const newCounts: Record<number, number> = {
      500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
    };
    for (const d of DENOMINATIONS) {
      if (rem >= d) {
        const cnt = Math.floor(rem / d);
        newCounts[d] = cnt;
        rem %= d;
      }
    }
    setDenomCounts(newCounts);
    const totalTapped = Object.entries(newCounts).reduce((sum, [k, v]) => sum + Number(k) * v, 0);
    setCashTendered(totalTapped > 0 ? totalTapped.toString() : "");
  };


  const changeRequired = useMemo(() => {
    const totalTendered = targetCash + effectiveUpiAmount;
    if (paymentEditMode === "ADJUST" && editingCompletedBill) {
      const surplus = Math.max(0, adjustOldTotal - grandTotal);
      return surplus + Math.max(0, totalTendered - effectiveGrandTotalForCollection);
    }
    return Math.max(0, totalTendered - grandTotal) + creditCashedOut;
  }, [grandTotal, targetCash, effectiveUpiAmount, paymentEditMode, editingCompletedBill, adjustOldTotal, effectiveGrandTotalForCollection, creditCashedOut]);
  
  const isPureSurplusRefund = paymentEditMode === "ADJUST" && !!editingCompletedBill && effectiveGrandTotalForCollection <= 0;
  
  // Validation rule: Cash denomination note tapping is mandatory if there is money to collect
  const isPaymentValid = useMemo(() => {
    if (selectedPaymentMethod === "UPI") {
      if (directUpiShortfall > 0) {
        return autoRecordDebitOnShortfall;
      }
      return true;
    }
    if (effectiveGrandTotalForCollection > 0 && denomTotal <= 0 && !isRestUpiConfirmed && !autoRecordDebitOnShortfall) return false;

    // Check if Change Tapping is valid
    if (changeDenomTotal > changeRequired) {
      if (!autoRecordExtraChangeAsDebt) return false;
    } else if (changeDenomTotal < changeRequired) {
      if (!autoConvertCredit) {
        const manualCredit = parseFloat(recordCreditAmount) || 0;
        if (changeDenomTotal + manualCredit !== changeRequired) return false;
      }
    }

    if (denomTotal >= effectiveGrandTotalForCollection) return true;
    if (targetCash >= effectiveGrandTotalForCollection) return true;

    // With Split / Shortfall:
    // Cash + UPI + Debit must satisfy effectiveGrandTotalForCollection
    const coveredByCash = denomTotal;
    const coveredByUpi = effectiveUpiAmount;
    const coveredByDebit = autoRecordDebitOnShortfall ? remainingAfterUpi : 0;
    return (coveredByCash + coveredByUpi + coveredByDebit) >= effectiveGrandTotalForCollection;
  }, [selectedPaymentMethod, directUpiShortfall, denomTotal, effectiveGrandTotalForCollection, isRestUpiConfirmed, effectiveUpiAmount, remainingAfterUpi, autoRecordDebitOnShortfall, targetCash, changeRequired, changeDenomTotal, autoConvertCredit, recordCreditAmount, autoRecordExtraChangeAsDebt]);

  const smartHighlightedChangeDenoms = useMemo(() => {
    if (changeRequired <= 0) return new Set<number>();
    const remainingChangeNeeded = changeRequired - changeDenomTotal;
    if (remainingChangeNeeded <= 0) return new Set<number>();

    const highlighted = new Set<number>();
    
    // Any note <= remaining change is possible to give back
    DENOMINATIONS.forEach((d) => {
      if (d <= remainingChangeNeeded) highlighted.add(d);
    });

    return highlighted;
  }, [changeRequired, changeDenomTotal]);



  const handleAddChangeNote = (denom: number) => {
    setChangeDenomCounts({ ...changeDenomCounts, [denom]: (changeDenomCounts[denom] || 0) + 1 });
  };
  const handleRemoveChangeNote = (denom: number) => {
    if ((changeDenomCounts[denom] || 0) <= 0) return;
    setChangeDenomCounts({ ...changeDenomCounts, [denom]: changeDenomCounts[denom] - 1 });
  };
  const handleAutoTapChangeExact = (amt: number) => {
    const counts = { 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 };
    let remaining = Math.round(amt);
    for (const d of DENOMINATIONS) {
      if (remaining >= d) {
        counts[d] = Math.floor(remaining / d);
        remaining -= counts[d] * d;
      }
    }
    setChangeDenomCounts(counts);
  };

  const handleAddNote = (denom: number) => {
    const nextCounts = { ...denomCounts, [denom]: (denomCounts[denom] || 0) + 1 };
    setDenomCounts(nextCounts);
    const nextTotal = Object.entries(nextCounts).reduce((sum, [k, v]) => sum + Number(k) * v, 0);
    if (nextTotal > targetCash || targetCash === 0) {
      setCashTendered(nextTotal.toString());
    }
  };

  const handleRemoveNote = (denom: number) => {
    if ((denomCounts[denom] || 0) <= 0) return;
    const nextCounts = { ...denomCounts, [denom]: denomCounts[denom] - 1 };
    setDenomCounts(nextCounts);
    const nextTotal = Object.entries(nextCounts).reduce((sum, [k, v]) => sum + Number(k) * v, 0);
    if (nextTotal > 0) {
      setCashTendered(nextTotal.toString());
    } else {
      setCashTendered("");
    }
  };

  const handleResetNotes = () => {
    setDenomCounts({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
    setChangeDenomCounts({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
    setCashTendered("");
    setIsRestUpiConfirmed(false);
    setCustomUpiAmount("");
    setIsCustomUpiEditing(false);
    setDirectUpiCustomAmount("");
    setIsDirectUpiEditing(false);
    setRedeemPoints(0);
    setDeliveryCharge(0);
    setHandlingCharge(0);
  };

  const onSettlePayment = async () => {
    let finalCash = { ...denomCounts };
    let finalChange = { ...changeDenomCounts };

    if (editingCompletedBill && paymentEditMode === "ADJUST") {
       const oldCash = editingCompletedBill.cash_denominations || {};
       const oldChange = editingCompletedBill.change_denominations || {};
       
       // Merge old cash with new cash
       Object.entries(oldCash).forEach(([d, c]) => {
          finalCash[Number(d)] = (finalCash[Number(d)] || 0) + Number(c);
       });

       // Merge old change with new change
       Object.entries(oldChange).forEach(([d, c]) => {
          finalChange[Number(d)] = (finalChange[Number(d)] || 0) + Number(c);
       });
    }

    const applyCreditFromInput = parseFloat(applyCreditAmount) || 0;
    // applyCredit is capped at what was actually needed to pay the bill
    let applyCredit = Math.min(applyCreditFromInput, grandTotalBeforeCredit);
    let recordDebit = parseFloat(recordDebitAmount) || 0;
    let recordCredit = parseFloat(recordCreditAmount) || 0;
    let debtSettled = 0;
    let finalCreditCashedOut = Math.max(0, applyCreditFromInput - grandTotalBeforeCredit);
    
    if (selectedPaymentMethod === "CASH") {
      // NOTE: changeRequired already includes finalCreditCashedOut
      // If we are auto-converting change back into credit, we should probably NOT do it if they literally just cashed out credit.
      // But if they paid excess cash AND cashed out credit, the unreturnedChange calculation handles it perfectly.
      if (changeRequired > 0 && autoConvertCredit && changeRequired > changeDenomTotal) {
        const remainingChange = changeRequired - changeDenomTotal;
        // The customer is owed change. Check if they have debt to pay off first, UNLESS they are already explicitly settling it.
        const effectiveDebt = (customerAnalytics && customerAnalytics.credit_balance !== undefined && customerAnalytics.credit_balance < 0 && !settleDebit)
            ? Math.abs(customerAnalytics.credit_balance)
            : 0;
            
        if (effectiveDebt > 0) {
            if (remainingChange <= effectiveDebt) {
                debtSettled = remainingChange;
            } else {
                debtSettled = effectiveDebt;
                recordCredit = remainingChange - effectiveDebt;
            }
        } else {
            recordCredit = remainingChange;
        }
      }

      if (changeDenomTotal > changeRequired && autoRecordExtraChangeAsDebt) {
        recordDebit += (changeDenomTotal - changeRequired);
      }

      if (effectiveGrandTotalForCollection > denomTotal && autoRecordDebitOnShortfall && remainingAfterUpi > 0) {
        const shortfall = remainingAfterUpi;
        
        let unusedCredit = 0;
        if (customerAnalytics && customerAnalytics.credit_balance !== undefined && customerAnalytics.credit_balance > 0) {
            unusedCredit = Math.max(0, customerAnalytics.credit_balance - applyCreditFromInput);
        }

        if (unusedCredit > 0) {
           if (shortfall <= unusedCredit) {
             applyCredit = applyCreditFromInput + shortfall;
           } else {
             applyCredit = applyCreditFromInput + unusedCredit;
             recordDebit = shortfall - unusedCredit;
           }
        } else {
           recordDebit = shortfall;
        }
      }
    } else if (selectedPaymentMethod === "UPI") {
      if (directUpiSurplus > 0 && autoConvertCredit) {
        const surplus = directUpiSurplus;
        const effectiveDebt = (customerAnalytics && customerAnalytics.credit_balance !== undefined && customerAnalytics.credit_balance < 0 && !settleDebit)
            ? Math.abs(customerAnalytics.credit_balance)
            : 0;

        if (effectiveDebt > 0) {
            if (surplus <= effectiveDebt) {
                debtSettled = surplus;
            } else {
                debtSettled = effectiveDebt;
                recordCredit = surplus - effectiveDebt;
            }
        } else {
            recordCredit = surplus;
        }
      }

      if (directUpiShortfall > 0 && autoRecordDebitOnShortfall) {
        const shortfall = directUpiShortfall;
        let unusedCredit = 0;
        if (customerAnalytics && customerAnalytics.credit_balance !== undefined && customerAnalytics.credit_balance > 0) {
            unusedCredit = Math.max(0, customerAnalytics.credit_balance - applyCreditFromInput);
        }

        if (unusedCredit > 0) {
           if (shortfall <= unusedCredit) {
             applyCredit = applyCreditFromInput + shortfall;
           } else {
             applyCredit = applyCreditFromInput + unusedCredit;
             recordDebit = shortfall - unusedCredit;
           }
        } else {
           recordDebit = shortfall;
        }
      }
    }

    // When settling debit, the customer pays extra cash to clear their debt.
    // The backend uses debt_settled to increase their balance back up to zero.
    if (settleDebit && customerAnalytics && customerAnalytics.credit_balance !== undefined && customerAnalytics.credit_balance < 0) {
      debtSettled += Math.abs(customerAnalytics.credit_balance);
    }
    
    // Validation: Cannot process Udhaar or Store Credit without linking a customer
    const isCustomerLinked = Boolean(paymentTargetBill?.customer_phone);
    if (!isCustomerLinked && (applyCredit > 0 || recordDebit > 0 || recordCredit > 0 || debtSettled > 0 || finalCreditCashedOut > 0)) {
        setError("Cannot process Udhaar or Store Credit without linking a customer first. Please link a customer to the bill.");
        return;
    }

    if (isSubmitting) return;

    // Sanitize denominations: do not send zero-count dictionaries that pollute the cash ledger
    const cleanFinalCash: Record<string, number> = {};
    Object.entries(finalCash).forEach(([d, c]) => {
      if (c > 0) cleanFinalCash[d] = c;
    });

    const cleanFinalChange: Record<string, number> = {};
    Object.entries(finalChange).forEach(([d, c]) => {
      if (c > 0) cleanFinalChange[d] = c;
    });

    let finalCashAmount: number | undefined = undefined;
    let finalUpiAmount: number | undefined = undefined;

    if (selectedPaymentMethod === "CASH") {
      if (effectiveUpiAmount > 0) {
        finalUpiAmount = effectiveUpiAmount;
        finalCashAmount = Math.max(0, effectiveGrandTotalForCollection - effectiveUpiAmount - (autoRecordDebitOnShortfall ? remainingAfterUpi : 0));
      } else {
        finalCashAmount = Math.max(0, effectiveGrandTotalForCollection - (autoRecordDebitOnShortfall ? remainingNeeded : 0));
        finalUpiAmount = 0;
      }
    } else if (selectedPaymentMethod === "UPI") {
      finalUpiAmount = effectiveDirectUpiAmount;
      finalCashAmount = 0;
    }

    setIsSubmitting(true);
    try {
      await handleMarkPaid(
        Object.keys(cleanFinalCash).length > 0 ? cleanFinalCash : undefined,
        Object.keys(cleanFinalChange).length > 0 ? cleanFinalChange : undefined,
        redeemPoints,
        deliveryCharge,
        handlingCharge,
        applyCredit,
        recordDebit,
        recordCredit,
        debtSettled,
        finalCreditCashedOut,
        finalCashAmount,
        finalUpiAmount
      );
      // Requirement 4: Once marked paid & settled, clear note denomination selection
      handleResetNotes();
      setCashTendered("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to settle bill.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeNotesList = Object.entries(denomCounts).filter(([_, count]) => count > 0);
  const activeChangeNotesList = Object.entries(changeDenomCounts).filter(([_, count]) => count > 0);

  const returnSectionRef = React.useRef<HTMLDivElement>(null);
  const intakeSectionRef = React.useRef<HTMLDivElement>(null);

  // Keyboard Shortcuts (Numpad) Listener
  const latestHandlers = React.useRef({
    activeTappingMode,
    setActiveTappingMode,
    isPaymentValid,
    isSubmitting,
    onSettlePayment,
    handleResetNotes,
    handleRemoveNote,
    handleRemoveChangeNote,
    handleAddNote,
    handleAddChangeNote,
    returnSectionRef,
    intakeSectionRef,
  });

  useEffect(() => {
    latestHandlers.current = {
      activeTappingMode,
      setActiveTappingMode,
      isPaymentValid,
      isSubmitting,
      onSettlePayment,
      handleResetNotes,
      handleRemoveNote,
      handleRemoveChangeNote,
      handleAddNote,
      handleAddChangeNote,
      returnSectionRef,
      intakeSectionRef,
    };
  });

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
        return;
      }

      const h = latestHandlers.current;

      if (e.key === "Escape") {
        e.preventDefault();
        if (onBackToDrawer) onBackToDrawer();
        else onClose();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (h.isPaymentValid && !h.isSubmitting) {
          void h.onSettlePayment();
        }
        return;
      }

      // Cash specific shortcuts below this point
      if (selectedPaymentMethod !== "CASH") return;

      if (e.key === " ") {
        e.preventDefault();
        h.setActiveTappingMode((prev: "INTAKE" | "RETURN") => {
          const next = prev === "INTAKE" ? "RETURN" : "INTAKE";
          setTimeout(() => {
            if (next === "RETURN") {
              h.returnSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else if (next === "INTAKE") {
              h.intakeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 50);
          return next;
        });
        return;
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        h.handleResetNotes(); // clears both intake and change
        return;
      }

      const numpadMap: Record<string, number> = {
        "Numpad7": 500, "Digit7": 500,
        "Numpad8": 200, "Digit8": 200,
        "Numpad9": 100, "Digit9": 100,
        "Numpad4": 50,  "Digit4": 50,
        "Numpad5": 20,  "Digit5": 20,
        "Numpad6": 10,  "Digit6": 10,
        "Numpad1": 5,   "Digit1": 5,
        "Numpad2": 2,   "Digit2": 2,
        "Numpad3": 1,   "Digit3": 1
      };

      const denom = numpadMap[e.code];
      if (denom) {
        e.preventDefault();
        
        // Windows Numpad weirdness: Shift + Numpad7 (NumLock ON) sends e.key="Home", e.shiftKey=false.
        // We detect this by checking if it's a Numpad key but the key string isn't a number.
        const isNumpadShifted = e.code.startsWith("Numpad") && !/^\d$/.test(e.key);
        const isRemoveAction = e.shiftKey || isNumpadShifted;

        if (isRemoveAction) {
          if (h.activeTappingMode === "INTAKE") h.handleRemoveNote(denom);
          else h.handleRemoveChangeNote(denom);
        } else {
          if (h.activeTappingMode === "INTAKE") h.handleAddNote(denom);
          else h.handleAddChangeNote(denom);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedPaymentMethod, onBackToDrawer, onClose]);


  if (!isOpen || !paymentTargetBill) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full h-full max-w-none max-h-none flex flex-col rounded-none border-none bg-[var(--bg-surface)] overflow-hidden">
        {/* Header (Fixed Top flex-shrink-0) */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-elevated)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToDrawer || onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-bold text-[var(--text-primary)] hover:border-sky-500 hover:text-sky-400 transition shadow-xs cursor-pointer"
              title="Return back to item selection drawer"
            >
              <ArrowLeft className="h-4 w-4 text-sky-400" />
              <span>Back to Edit Items</span>
            </button>
            <div className="h-5 w-[1px] bg-[var(--border-subtle)] mx-0.5" />
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[var(--accent-brand)]" />
              <div>
                <h3 className="font-display text-base font-bold leading-none">
                  {editingCompletedBill ? "Process Settlement Payment" : "Process Payment"}
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
                  {editingCompletedBill
                    ? `Settlement for Bill #${editingCompletedBill.id.slice(0, 8).toUpperCase()} • ${paymentTargetBill.basket_number && paymentTargetBill.basket_number.toUpperCase().includes("WALK") ? "Walk-In" : `Basket #${paymentTargetBill.basket_number}`}`
                    : `Bill #${paymentTargetBill.id.slice(0, 8).toUpperCase()} • ${paymentTargetBill.basket_number && paymentTargetBill.basket_number.toUpperCase().includes("WALK") ? "Walk-In" : `Basket #${paymentTargetBill.basket_number}`}`
                  }
                </p>
              </div>

            </div>
          </div>
          <button
            type="button"
            onClick={onDiscardBill || onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-rose-400 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="bg-rose-500/10 border-b border-rose-500/30 px-4 py-2.5 flex items-center justify-between text-sm font-bold text-rose-500 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded-full bg-rose-500 p-0.5 text-[var(--bg-surface)]">
                <X className="h-3.5 w-3.5" />
              </span>
              {error}
            </div>
            <button type="button" onClick={() => setError(null)} className="opacity-70 hover:opacity-100 uppercase text-[10px] tracking-wider px-2 py-1 rounded bg-rose-500/20">
              Dismiss
            </button>
          </div>
        )}

        {/* Modal Body: 2 Columns (Flex-1 min-h-0 overflow-hidden) */}
        <div className="flex-1 min-h-0 grid lg:grid-cols-12 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]">
          {/* Left Column: Bill Breakdown & Items */}
          <div className="lg:col-span-6 p-4 flex flex-col justify-between h-full min-h-0 overflow-hidden space-y-3">
            {/* Top Customer Info & Order Header */}
            <div className="space-y-2 flex-shrink-0">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Order Summary
                  </span>
                  {totalItemCount > 0 && (
                    <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full">
                      {totalItemCount} {totalItemCount === 1 ? "Item" : "Items"} ({formattedTotalQty} Qty)
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono font-bold text-[var(--accent-brand)] bg-[var(--accent-brand)]/10 px-2.5 py-0.5 rounded-md">
                  {paymentTargetBill.source ? paymentTargetBill.source.toUpperCase() : "POS BILL"}
                </span>
              </div>

              {/* Customer & Loyalty Points */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--bg-surface-elevated)] p-2.5 rounded-xl border border-[var(--border-subtle)]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Customer</span>
                  <span className="font-bold text-[var(--text-primary)] text-base block mt-0.5">
                    {paymentTargetBill.customer_name || "Walk-In Customer"}
                  </span>
                  {paymentTargetBill.customer_phone && (
                    <span className="block text-sm text-[var(--text-muted)] font-mono">{paymentTargetBill.customer_phone}</span>
                  )}
                </div>
                
                <div className="flex flex-col space-y-1 border-l border-[var(--border-subtle)] pl-3">
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    <span>Loyalty Points</span>
                  </div>
                  {(() => {
                    const applicableTier = (restaurant?.loyalty_redemption_tiers || []).find(t => 
                      (customerAnalytics?.loyalty_points || 0) >= t.min_points && 
                      (t.max_points == null || (customerAnalytics?.loyalty_points || 0) <= t.max_points)
                    );
                    const pointValue = applicableTier ? (applicableTier.discount_percentage / 100) : 0;
                    const maxBillPercentage = parseFloat(String(restaurant?.loyalty_max_bill_percentage || "100.00"));
                    const maxAllowedDiscount = (maxBillPercentage / 100) * subtotalAmount;
                    const pointsRequiredForMax = pointValue > 0 ? Math.ceil(maxAllowedDiscount / pointValue) : 0;
                    const maxPointsToRedeem = Math.min(customerAnalytics?.loyalty_points || 0, pointsRequiredForMax);

                    if ((customerAnalytics?.loyalty_points || 0) > 0 && pointValue > 0) {
                      return (
                        <div className="flex-1 flex flex-col justify-center space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={maxPointsToRedeem}
                              value={redeemPoints || ""}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setRedeemPoints(Math.min(val, maxPointsToRedeem));
                              }}
                              placeholder="Pts"
                              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1 px-2 text-xs font-mono font-bold focus:border-sky-500 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setRedeemPoints(maxPointsToRedeem)}
                              className="px-2 py-1 rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-strong)] text-[10px] font-bold hover:border-sky-500 transition"
                            >
                              Max
                            </button>
                          </div>
                          <div className="text-[12px] text-[var(--text-muted)] font-bold flex justify-between items-center">
                            <span>Bal: {customerAnalytics?.loyalty_points}</span>
                            <span className="text-emerald-500">
                              {redeemPoints > 0 ? `-₹${Math.min(redeemPoints * pointValue, maxAllowedDiscount).toFixed(2)}` : `≈ ₹${(((customerAnalytics?.loyalty_points) || 0) * pointValue).toFixed(2)}`}
                            </span>
                          </div>
                        </div>
                      );
                    } else if (customerAnalytics) {
                       const hasPoints = (customerAnalytics.loyalty_points || 0) > 0;
                       if (hasPoints) {
                         return (
                           <div className="flex-1 flex flex-col items-center justify-center text-xs text-[var(--text-muted)] text-center opacity-70">
                             <div>Bal: {customerAnalytics.loyalty_points}</div>
                             <div className="text-[10px] text-rose-400 font-bold">Not enough to redeem</div>
                           </div>
                         );
                       }
                       return <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--text-muted)] text-center opacity-70">No points avail</div>;
                    }
                    return <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--text-muted)] text-center opacity-70">Link customer</div>;
                  })()}
                </div>
              </div>
            </div>

            {/* Middle Line Items List (ONLY THIS CONTAINER SCROLLS) */}
            {paymentTargetBill.items && paymentTargetBill.items.length > 0 ? (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1.5">
                <div className="sticky top-0 bg-[var(--bg-surface)] py-1 flex items-center justify-between px-3 text-[10px] uppercase font-bold text-[var(--text-muted)] border-b border-[var(--border-subtle)] z-10">
                  <div className="flex items-center gap-2">
                    <span>Item Description</span>
                    {totalItemCount > 0 && (
                      <span className="text-[9px] font-mono font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.2 rounded-full normal-case">
                        {totalItemCount} {totalItemCount === 1 ? "item" : "items"} • {formattedTotalQty} qty
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-6 font-mono">
                    <span className="w-16 text-right">MRP</span>
                    <span className="w-20 text-right">Selling Price</span>
                  </div>
                </div>
                {paymentTargetBill.items.map((item: any, idx: number) => {
                  const qty = item.quantity || 1;
                  const unitPrice = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price) || 0;
                  const lineSellingTotal = unitPrice * qty;
                  const itemMrpUnit = item.mrp !== undefined && item.mrp !== null ? (typeof item.mrp === "number" ? item.mrp : parseFloat(item.mrp) || unitPrice) : unitPrice;
                  const lineMrpTotal = itemMrpUnit * qty;

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-base"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-bold text-[var(--text-primary)] truncate">
                          {qty}× {item.item_name || item.menu_item?.name || "Item"}
                        </span>
                        {item.is_complimentary && (
                          <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-bold">
                            FREE
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-6 font-mono">
                        <span className="text-[var(--text-muted)] line-through text-sm w-16 text-right">
                          ₹{lineMrpTotal.toFixed(2)}
                        </span>
                        <span className="font-bold text-[var(--text-primary)] w-20 text-right">
                          ₹{lineSellingTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-strong)] rounded-xl my-auto">
                Bill items recorded in active basket session
              </div>
            )}

            {/* Bottom Fixed Footer: Grand Total Box */}
            <div className="flex-shrink-0 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3 space-y-1">
              <div className="flex justify-between text-xs text-[var(--text-muted)] font-mono">
                <span className="font-sans">
                  Subtotal {totalItemCount > 0 && `(${totalItemCount} ${totalItemCount === 1 ? "item" : "items"} • ${formattedTotalQty} qty)`}
                </span>
                <span>₹{subtotalAmount.toFixed(2)}</span>
              </div>

              {/* Loyalty Discount Summary */}
              {redeemPoints > 0 && (
                <div className="flex justify-between text-xs text-emerald-400 font-mono font-bold">
                  <span className="font-sans flex items-center gap-1.5">
                    Loyalty Redemptions
                    <span className="text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      ({redeemPoints} points)
                    </span>
                  </span>
                  <span>
                    - ₹
                    {(() => {
                      const applicableTier = (restaurant?.loyalty_redemption_tiers || []).find(t =>
                        (customerAnalytics?.loyalty_points || 0) >= t.min_points &&
                        (t.max_points == null || (customerAnalytics?.loyalty_points || 0) <= t.max_points)
                      );
                      const pointValue = applicableTier ? (applicableTier.discount_percentage / 100) : 0;
                      const maxBillPercentage = parseFloat(String(restaurant?.loyalty_max_bill_percentage || "100.00"));
                      const requestedDiscount = redeemPoints * pointValue;
                      const maxAllowedDiscount = (maxBillPercentage / 100) * subtotalAmount;
                      const loyaltyDiscount = Math.min(requestedDiscount, maxAllowedDiscount);
                      return loyaltyDiscount.toFixed(2);
                    })()}
                  </span>
                </div>
              )}

              {calculatedDiscountRupees > 0 && (
                <div className="flex justify-between text-xs text-sky-400 font-mono font-bold">
                  <span className="font-sans flex items-center gap-1.5">
                    Discount Applied
                    {paymentTargetBill.discount_type === "PERCENT" && (
                      <span className="text-[10px] bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                        ({paymentTargetBill.discount_value}% OFF)
                      </span>
                    )}
                    {paymentTargetBill.discount_type === "FLAT" && (
                      <span className="text-[10px] bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                        (Flat ₹{paymentTargetBill.discount_value})
                      </span>
                    )}
                    {paymentTargetBill.discount_type === "COMPLIMENTARY" && (
                      <span className="text-[10px] bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                        (Complimentary 100% OFF)
                      </span>
                    )}
                    {paymentTargetBill.discount_type === "COMPLIMENTARY_ITEMS" && (
                      <span className="text-[10px] bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                        (Complimentary Items)
                      </span>
                    )}
                  </span>
                  <span>- ₹{calculatedDiscountRupees.toFixed(2)}</span>
                </div>
              )}

              {paymentTargetBill.tax_amount !== undefined && paymentTargetBill.tax_amount > 0 && (
                <div className="flex justify-between text-xs text-cyan-400 font-mono">
                  <span className="font-sans">GST Tax Component</span>
                  <span>₹{paymentTargetBill.tax_amount.toFixed(2)}</span>
                </div>
              )}



              <div className="flex justify-between items-center border-t border-[var(--border-subtle)] pt-2 text-base font-bold font-mono text-[var(--text-primary)]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-sans font-black text-xs uppercase tracking-wider">Grand Total Payable:</span>
                  {totalItemCount > 0 && (
                    <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20 font-sans tracking-normal">
                      {totalItemCount} {totalItemCount === 1 ? "Item" : "Items"} ({formattedTotalQty} Qty)
                    </span>
                  )}
                </div>
                <span className={`text-xl font-black ${editingCompletedBill && paymentEditMode === "ADJUST" ? "text-[var(--text-muted)] line-through" : "text-sky-400"}`}>₹{grandTotal.toFixed(2)}</span>
              </div>

              {editingCompletedBill && (
                <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentEditMode("ADJUST")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                        paymentEditMode === "ADJUST"
                          ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                          : "bg-[var(--bg-surface)] border-[var(--border-strong)] text-[var(--text-muted)] hover:border-amber-500/30"
                      }`}
                    >
                      Adjust Payment
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentEditMode("FULL")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                        paymentEditMode === "FULL"
                          ? "bg-sky-500/20 border-sky-500/50 text-sky-400"
                          : "bg-[var(--bg-surface)] border-[var(--border-strong)] text-[var(--text-muted)] hover:border-sky-500/30"
                      }`}
                    >
                      Full Repayment
                    </button>
                  </div>
                  {paymentEditMode === "ADJUST" && (
                    <div className="flex justify-between items-center text-base font-bold font-mono text-[var(--text-primary)] bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                      <span className="font-sans font-black text-xs uppercase tracking-wider text-amber-400">
                        {effectiveGrandTotalForCollection > 0 ? "Additional Amount Due:" : "Surplus / Change to give:"}
                      </span>
                      <span className={`text-xl font-black ${effectiveGrandTotalForCollection > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                        ₹{effectiveGrandTotalForCollection > 0 ? effectiveGrandTotalForCollection.toFixed(2) : Math.max(0, adjustOldTotal - grandTotal).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Actions: Delivery, Handling, Wallet */}
            <div className="flex-shrink-0 grid grid-cols-2 gap-3 mt-3">
              {/* Box 1: Delivery & Handling (Horizontally Split) */}
              <div className="flex flex-col p-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] shadow-sm">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  <span>Additional Charges</span>
                </div>
                <div className="flex gap-2 h-full">
                  <div className="flex-1 flex flex-col justify-end">
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Delivery</label>
                    <input
                      type="number"
                      min="0"
                      value={deliveryCharge || ""}
                      onChange={(e) => setDeliveryCharge(parseFloat(e.target.value) || 0)}
                      placeholder="₹0.00"
                      className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs font-mono font-bold focus:border-sky-500 outline-none"
                    />
                  </div>
                  <div className="flex-1 flex flex-col justify-end">
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Handling</label>
                    <input
                      type="number"
                      min="0"
                      value={handlingCharge || ""}
                      onChange={(e) => setHandlingCharge(parseFloat(e.target.value) || 0)}
                      placeholder="₹0.00"
                      className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs font-mono font-bold focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Box 2: Customer Wallet */}
              <div className="flex flex-col space-y-1.5 p-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] shadow-sm">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  <span>Customer Wallet</span>
                  {customerAnalytics && customerAnalytics.credit_balance !== undefined && (
                    (() => {
                      let bal = customerAnalytics.credit_balance;
                      
                      if (settleDebit && customerAnalytics.credit_balance < 0) {
                        bal += Math.abs(customerAnalytics.credit_balance);
                      }
                      
                      const creditToApply = parseFloat(applyCreditAmount) || 0;
                      if (creditToApply > 0) {
                        bal -= creditToApply;
                      }

                      if (selectedPaymentMethod === "CASH") {
                        if (changeRequired > changeDenomTotal && autoConvertCredit) {
                          bal += (changeRequired - changeDenomTotal);
                        }
                        if (autoRecordDebitOnShortfall && remainingAfterUpi > 0) {
                          bal -= remainingAfterUpi;
                        }
                        if (changeDenomTotal > changeRequired && autoRecordExtraChangeAsDebt) {
                          bal -= (changeDenomTotal - changeRequired);
                        }
                      } else if (selectedPaymentMethod === "UPI") {
                        if (directUpiSurplus > 0 && autoConvertCredit) {
                          bal += directUpiSurplus;
                        }
                        if (directUpiShortfall > 0 && autoRecordDebitOnShortfall) {
                          bal -= directUpiShortfall;
                        }
                      }
                      const orig = Number(customerAnalytics.credit_balance) || 0;
                      const isModified = Math.abs(Number(bal) - orig) > 0.005;

                      if (bal > 0) {
                        return <span className={`font-mono text-[20px] transition-colors ${isModified ? 'text-amber-400 font-bold' : 'text-emerald-500'}`}>₹{bal.toFixed(2)} (Cr)</span>
                      } else if (bal < 0) {
                        return <span className={`font-mono text-[20px] transition-colors ${isModified ? 'text-amber-400 font-bold' : 'text-rose-500'}`}>-₹{Math.abs(bal).toFixed(2)} (Dr)</span>
                      } else {
                        return <span className={`font-mono text-[20px] transition-colors ${isModified ? 'text-amber-400 font-bold' : 'text-[var(--text-muted)]'}`}>₹0.00</span>
                      }
                    })()
                  )}
                </div>
                {customerAnalytics && customerAnalytics.credit_balance !== undefined ? (
                  <div className="flex-1 flex flex-col justify-center space-y-2">
                    {customerAnalytics.credit_balance > 0 ? (
                      <div className="flex items-center gap-1.5 mt-auto mb-auto">
                        <input
                          type="number"
                          min={0}
                          max={customerAnalytics.credit_balance}
                          value={applyCreditAmount}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setApplyCreditAmount(Math.min(val, customerAnalytics.credit_balance!).toString());
                          }}
                          placeholder="Apply Cr."
                          className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1.5 px-2 text-xs font-mono font-bold focus:border-sky-500 outline-none"
                        />
                        <div className="flex gap-1.5 flex-1">
                          <button
                            type="button"
                            onClick={() => {
                              setApplyCreditAmount(Math.min(grandTotalBeforeCredit, customerAnalytics.credit_balance!).toString());
                            }}
                            className="flex-1 rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-strong)] text-[10px] font-bold hover:border-sky-500 transition whitespace-nowrap"
                          >
                            Max
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setApplyCreditAmount(customerAnalytics.credit_balance!.toString());
                              setActiveTappingMode("RETURN");
                            }}
                            className="flex-1 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/30 text-[10px] font-bold hover:bg-orange-500 hover:text-white transition whitespace-nowrap"
                          >
                            Cash Out
                          </button>
                        </div>
                      </div>
                    ) : customerAnalytics.credit_balance < 0 ? (
                      <label className="flex items-center justify-between bg-[var(--bg-surface)] px-2 py-1.5 rounded-lg cursor-pointer border border-[var(--border-strong)] hover:border-sky-500/50 transition mt-auto mb-auto">
                        <span className="text-xs font-bold text-[var(--text-primary)]">Settle Debt</span>
                        <input 
                          type="checkbox" 
                          checked={settleDebit}
                          onChange={(e) => setSettleDebit(e.target.checked)}
                          className="rounded border-[var(--border-strong)] bg-[var(--bg-surface)] text-sky-500 focus:ring-sky-500/30 w-3.5 h-3.5"
                        />
                      </label>
                    ) : (
                       <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--text-muted)] text-center opacity-70">
                         No balance
                       </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--text-muted)] text-center opacity-70">
                    Link customer
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right Column: Settlement Method & Actions */}
          <div className="lg:col-span-6 p-4 flex flex-col justify-between h-full min-h-0 overflow-hidden space-y-3 bg-[var(--bg-surface)]">
            {/* Top Payment Method Selector (Compact Height) */}
            <div className="space-y-1.5 flex-shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                Select Payment Method
              </span>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("CASH")}
                  className={`rounded-xl border p-2.5 flex items-center justify-center gap-2 text-xs font-bold transition ${
                    selectedPaymentMethod === "CASH"
                      ? "border-sky-500 bg-sky-500/10 text-sky-500 shadow-xs"
                      : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <DollarSign className="h-4 w-4" />
                  <span>CASH PAYMENT</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("UPI")}
                  className={`rounded-xl border p-2.5 flex items-center justify-center gap-2 text-xs font-bold transition ${
                    selectedPaymentMethod === "UPI"
                      ? "border-sky-500 bg-sky-500/10 text-sky-500 shadow-xs"
                      : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <QrCode className="h-4 w-4" />
                  <span>DIRECT UPI</span>
                </button>
              </div>
            </div>

            {/* Middle Cash Settlement Section (Compact Padding, No Scroll Required) */}
            {selectedPaymentMethod === "CASH" ? (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3">
                {!isPureSurplusRefund && (
                  <>
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Cash Tendered by Customer (₹)
                  </label>
                  {denomTotal > 0 && (
                    <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                      From Notes: ₹{denomTotal}
                    </span>
                  )}
                </div>

                <input
                  type="number"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  placeholder={`e.g. ${Math.ceil(grandTotal / 100) * 100}`}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1.5 px-3 text-sm font-mono font-bold focus:border-sky-500 outline-none"
                />

                {targetCash > 0 && denomTotal === 0 && (
                  <p className="text-[10px] text-amber-400 font-bold">
                    ⚠️ Note tapping is required. Tap note buttons below (₹500, ₹200, etc.) to validate payment.
                  </p>
                )}

                {/* Dynamic Interactive Cash Denomination Selector */}
                <div ref={intakeSectionRef} className={`space-y-1.5 pt-1.5 border-t border-[var(--border-subtle)] p-2 rounded-xl transition-all ${
                  activeTappingMode === "INTAKE" ? "ring-2 ring-sky-500/50 bg-sky-500/5" : ""
                }`}>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                        Cash Denominations Tapped <span className="text-rose-400">*</span>
                        {activeTappingMode === "INTAKE" && (
                          <span className="ml-2 text-[var(--text-muted)] animate-pulse font-mono lowercase tracking-normal bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] px-1 rounded">kbd active</span>
                        )}
                      </span>
                    </div>
                    {remainingNeededAmt > 0 && (
                      <div className="text-center bg-[var(--bg-surface-elevated)] rounded-lg py-1.5 border border-[var(--border-strong)]">
                        <span className="font-mono text-sm font-bold text-[var(--text-secondary)]">
                          Need <span className="text-xl font-black text-[var(--text-primary)]">₹{remainingNeededAmt.toFixed(2)}</span> more
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quick Auto-Tap Shortcuts Bar */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] whitespace-nowrap">
                      Quick Auto-Tap:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAutoTapExact(grandTotal)}
                      className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--text-primary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] transition whitespace-nowrap"
                      title="Auto-fill exact note breakdown for Grand Total"
                    >
                      Exact ₹{grandTotal.toFixed(2)}
                    </button>

                    {smallestSingleNoteForGrandTotal && (
                      <button
                        type="button"
                        onClick={() => handleAutoTapExact(smallestSingleNoteForGrandTotal)}
                        className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--text-primary)] hover:border-sky-500 hover:text-sky-500 transition whitespace-nowrap"
                        title={`Auto-fill single ₹${smallestSingleNoteForGrandTotal} note`}
                      >
                        1× ₹{smallestSingleNoteForGrandTotal} Note
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {DENOMINATIONS.map((d) => {
                      const isSmartHighlight = smartHighlightedDenoms.has(d);
                      const count = denomCounts[d] || 0;
                      return (
                        <div
                          key={d}
                          className={`relative rounded-lg flex font-mono transition font-black border-2 ${
                            count > 0
                              ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-base)] ring-2 ring-[var(--text-muted)] shadow-md"
                              : isSmartHighlight
                                ? "border-[var(--text-muted)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] ring-1 ring-[var(--border-strong)] shadow-sm scale-[1.02] hover:bg-[var(--border-subtle)]"
                                : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)] opacity-60 hover:opacity-100"
                          }`}
                        >
                          {count > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveNote(d);
                              }}
                              className="flex items-center justify-center px-1.5 hover:bg-black/20 transition-colors border-r border-white/20 rounded-l-md"
                              title={`Remove 1× ₹${d}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAddNote(d)}
                            className="flex-1 py-3 px-2 text-center text-base"
                          >
                            ₹{d}
                          </button>
                          {count > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-slate-900 text-white text-xs font-black border border-white pointer-events-none">
                              {count}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Active Denominations Breakdown Chips */}
                  {activeNotesList.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
                      <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] mr-1">
                        Breakdown:
                      </span>
                      {activeNotesList.map(([denomStr, count]) => {
                        const denomNum = Number(denomStr);
                        return (
                          <span
                            key={denomStr}
                            className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-strong)] px-1.5 py-0.5 text-[10px] font-mono font-bold text-[var(--text-primary)]"
                          >
                            ₹{denomStr} × {count}
                            <button
                              type="button"
                              onClick={() => handleRemoveNote(denomNum)}
                              className="ml-1 text-[var(--text-muted)] hover:text-rose-400"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                      <button
                        type="button"
                        onClick={handleResetNotes}
                        className="ml-auto text-[10px] font-bold text-rose-400 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                </>
                )}

                {targetCash < effectiveGrandTotalForCollection && (
                  <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-sky-300 font-bold font-mono">
                      <span>Shortfall / Cash Deficiency:</span>
                      <span>₹{remainingNeeded.toFixed(2)} short</span>
                    </div>

                    {/* 1. UPI PAYMENT OPTION (Top) */}
                    <div className="pt-1.5 border-t border-sky-500/20">
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isRestUpiConfirmed}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setIsRestUpiConfirmed(checked);
                              if (checked) {
                                if (!customUpiAmount) {
                                  setCustomUpiAmount(remainingNeeded.toString());
                                }
                                const parsedUpi = parseFloat(customUpiAmount || remainingNeeded.toString()) || 0;
                                if (parsedUpi >= remainingNeeded) {
                                  setAutoRecordDebitOnShortfall(false);
                                }
                              } else {
                                setIsCustomUpiEditing(false);
                              }
                            }}
                            className="rounded h-4 w-4 text-sky-600 focus:ring-sky-500 border-gray-300"
                          />
                          <span className="truncate">
                            {isRestUpiConfirmed && effectiveUpiAmount < remainingNeeded
                              ? `Pay ₹${effectiveUpiAmount.toFixed(2)} via UPI`
                              : isRestUpiConfirmed && effectiveUpiAmount > remainingNeeded
                                ? `Pay ₹${effectiveUpiAmount.toFixed(2)} via UPI (₹${(effectiveUpiAmount - remainingNeeded).toFixed(2)} change due)`
                                : `Confirm remaining ₹${remainingNeeded.toFixed(2)} paid via UPI`}
                          </span>
                        </label>

                        {/* Pencil Edit Icon / Inline Input Controls */}
                        {isRestUpiConfirmed && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isCustomUpiEditing ? (
                              <div className="flex items-center gap-1 bg-[var(--bg-surface)] border border-sky-500/50 rounded-lg px-2 py-0.5 shadow-xs">
                                <span className="font-mono font-bold text-sky-400 text-xs">₹</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={customUpiAmount}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustomUpiAmount(val);
                                    const num = parseFloat(val) || 0;
                                    if (num >= remainingNeeded) {
                                      setAutoRecordDebitOnShortfall(false);
                                    }
                                  }}
                                  placeholder={remainingNeeded.toFixed(2)}
                                  className="w-20 bg-transparent font-mono text-xs font-bold text-[var(--text-primary)] focus:outline-none"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => setIsCustomUpiEditing(false)}
                                  className="p-1 text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
                                  title="Done editing UPI amount"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!customUpiAmount) {
                                    setCustomUpiAmount(remainingNeeded.toString());
                                  }
                                  setIsCustomUpiEditing(true);
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 px-2 py-0.5 rounded-lg transition cursor-pointer"
                                title="Edit UPI amount for partial split"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>{effectiveUpiAmount !== remainingNeeded ? `₹${effectiveUpiAmount.toFixed(2)}` : "Edit"}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {isCustomUpiEditing && (
                        <div className="flex items-center justify-between text-[10px] pt-1 pl-6">
                          {effectiveUpiAmount > remainingNeeded ? (
                            <span className="text-emerald-400 font-bold">
                              ₹{effectiveUpiAmount.toFixed(2)} on UPI exceeds shortfall by ₹{(effectiveUpiAmount - remainingNeeded).toFixed(2)} (change due)
                            </span>
                          ) : (
                            <span className="text-sky-300/70">
                              Enter amount to pay via UPI (exact shortfall: ₹{remainingNeeded.toFixed(2)})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setCustomUpiAmount(remainingNeeded.toString());
                              setIsCustomUpiEditing(false);
                              setAutoRecordDebitOnShortfall(false);
                            }}
                            className="underline hover:text-sky-200 cursor-pointer text-sky-400 shrink-0 ml-2"
                          >
                            Set Exact (₹{remainingNeeded.toFixed(2)})
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 2. CUSTOMER DEBIT / STORE CREDIT OPTION (Bottom) */}
                    {remainingAfterUpi > 0 && (
                      <div className="pt-1.5 border-t border-sky-500/20">
                        <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autoRecordDebitOnShortfall}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setAutoRecordDebitOnShortfall(checked);
                              if (checked && effectiveUpiAmount >= remainingNeeded) {
                                setIsRestUpiConfirmed(false);
                                setIsCustomUpiEditing(false);
                              }
                            }}
                            className="rounded h-4 w-4 text-sky-600 focus:ring-sky-500 border-gray-300"
                          />
                          <span className="leading-tight">
                            {(() => {
                              const unusedCr = (customerAnalytics && customerAnalytics.credit_balance !== undefined && customerAnalytics.credit_balance > 0) 
                                  ? Math.max(0, customerAnalytics.credit_balance - (parseFloat(applyCreditAmount) || 0)) 
                                  : 0;
                                  
                              if (unusedCr > 0) {
                                if (remainingAfterUpi <= unusedCr) {
                                  return `Adjust ₹${remainingAfterUpi.toFixed(2)} from Store Credit`;
                                } else {
                                  return `Adjust ₹${unusedCr.toFixed(2)} from Store Credit, add remaining ₹${(remainingAfterUpi - unusedCr).toFixed(2)} to Customer Debit (Udhaar)`;
                                }
                              }
                              return `Add remaining ₹${remainingAfterUpi.toFixed(2)} to Customer Debit (Udhaar)`;
                            })()}
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                )}

{(isPureSurplusRefund || creditCashedOut > 0 || changeRequired > 0 || (cashTendered && targetCash >= effectiveGrandTotalForCollection)) && (
                  <div ref={returnSectionRef} className="flex flex-col space-y-2 border-t border-[var(--border-subtle)] pt-2">
                    <div className="flex justify-between items-center font-mono font-bold text-[var(--text-primary)] pt-1">
                      <span className="text-base text-[var(--text-muted)]">Change Due to Customer:</span>
                      <span className="text-3xl font-black text-[var(--accent-brand)]">
                        ₹{changeRequired.toFixed(2)}
                      </span>
                    </div>

                    {changeRequired > 0 && (
                      <div className={`space-y-1.5 p-2 rounded-xl border border-[var(--border-subtle)] transition-all ${
                        activeTappingMode === "RETURN" ? "ring-2 ring-[var(--accent-brand)]/50 bg-[var(--accent-brand)]/5" : "bg-[var(--bg-surface)]"
                      }`}>
                        <div className="flex flex-col gap-2 pb-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                              Change Tapped <span className="text-rose-400">*</span>
                              {activeTappingMode === "RETURN" && (
                                <span className="ml-2 text-[var(--accent-brand)]/80 animate-pulse font-mono lowercase tracking-normal bg-[var(--accent-brand)]/10 px-1 rounded text-[10px]">kbd active</span>
                              )}
                            </span>
                          </div>
                          
                          <div className={`text-center py-1.5 rounded-lg border ${changeDenomTotal === changeRequired ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                            <div className={`font-mono font-bold flex items-baseline justify-center gap-1.5 ${changeDenomTotal === changeRequired ? 'text-emerald-500' : 'text-amber-500'}`}>
                              <span className="text-sm">Tapped:</span>
                              <span className="text-2xl font-black">₹{changeDenomTotal}</span>
                              <span className="text-sm text-[var(--text-muted)]">/</span>
                              <span className="text-base text-[var(--text-muted)] font-semibold">₹{changeRequired}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                            <button
                            type="button"
                            onClick={() => handleAutoTapChangeExact(changeRequired)}
                            className="rounded-lg bg-[var(--accent-brand)]/10 border border-[var(--accent-brand)]/40 px-2 py-0.5 text-[10px] font-mono font-extrabold text-[var(--accent-brand)] hover:bg-[var(--accent-brand)] hover:text-white transition whitespace-nowrap"
                            >
                            Auto-Tap Exact ₹{changeRequired}
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {DENOMINATIONS.map((d) => {
                            const isSmartHighlight = smartHighlightedChangeDenoms.has(d);
                            const count = changeDenomCounts[d] || 0;
                            return (
                              <div
                                key={`change-${d}`}
                                className={`relative rounded-lg flex font-mono transition font-bold border ${
                                  count > 0
                                    ? "border-[var(--accent-brand)] bg-[var(--accent-brand)] text-white ring-2 ring-[var(--accent-brand)]/30 shadow-md"
                                    : isSmartHighlight
                                      ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] ring-2 ring-[var(--accent-brand)]/50 shadow-sm scale-[1.02] hover:bg-[var(--accent-brand)]/20"
                                      : "border-[var(--border-strong)] bg-transparent text-[var(--text-muted)] hover:border-[var(--accent-brand)] hover:text-[var(--accent-brand)] hover:bg-[var(--accent-brand)]/5"
                                }`}
                              >
                                {count > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveChangeNote(d);
                                    }}
                                    className="flex items-center justify-center px-1.5 hover:bg-black/20 transition-colors border-r border-white/20 rounded-l-md"
                                    title={`Remove 1× ₹${d}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleAddChangeNote(d)}
                                  className="flex-1 py-3 px-2 text-center text-base"
                                >
                                  ₹{d}
                                </button>
                                {count > 0 && (
                                  <span className="absolute -top-1.5 -right-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-slate-900 text-white text-xs font-black border border-white pointer-events-none">
                                    {count}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        
                        {activeChangeNotesList.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                            {activeChangeNotesList.map(([denomStr, count]) => {
                              const denomNum = Number(denomStr);
                              return (
                                <span
                                  key={`change-chip-${denomStr}`}
                                  className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-strong)] px-1.5 py-0.5 text-[9px] font-mono font-bold"
                                >
                                  ₹{denomStr} × {count}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveChangeNote(denomNum)}
                                    className="ml-1 text-[var(--text-muted)] hover:text-rose-400"
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        
                        {changeDenomTotal > changeRequired && (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 mt-2 space-y-1.5 text-xs">
                            <div className="flex justify-between items-center text-amber-400 font-bold font-mono">
                              <span>Excess Change Tapped:</span>
                              <span>₹{(changeDenomTotal - changeRequired).toFixed(2)} extra</span>
                            </div>
                            <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] cursor-pointer pt-1 border-t border-amber-500/20">
                              <input
                                type="checkbox"
                                checked={autoRecordExtraChangeAsDebt}
                                onChange={(e) => setAutoRecordExtraChangeAsDebt(e.target.checked)}
                                className="rounded h-4 w-4 text-amber-600 focus:ring-amber-500 border-[var(--border-strong)] bg-[var(--bg-surface)]"
                              />
                              <span className="leading-tight">
                                Record extra ₹{(changeDenomTotal - changeRequired).toFixed(2)} as Customer Debt (Udhaar)
                              </span>
                            </label>
                          </div>
                        )}

                        {changeRequired > changeDenomTotal && (
                          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 mt-2 space-y-1.5 text-xs">
                            <div className="flex justify-between items-center text-emerald-400 font-bold font-mono">
                              <span>Cashier Shortfall:</span>
                              <span>₹{(changeRequired - changeDenomTotal).toFixed(2)} short</span>
                            </div>
                            <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] cursor-pointer pt-1 border-t border-emerald-500/20">
                              <input
                                type="checkbox"
                                checked={autoConvertCredit}
                                onChange={(e) => setAutoConvertCredit(e.target.checked)}
                                className="rounded h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-[var(--border-strong)] bg-[var(--bg-surface)]"
                              />
                              <span className="leading-tight">
                                {(() => {
                                  const unreturnedChange = changeRequired - changeDenomTotal;
                                  if (customerAnalytics && customerAnalytics.credit_balance !== undefined && customerAnalytics.credit_balance < 0 && !settleDebit) {
                                    const currentDebt = Math.abs(customerAnalytics.credit_balance);
                                    if (unreturnedChange <= currentDebt) {
                                      return `Adjust ₹${unreturnedChange.toFixed(2)} from Customer Debt`;
                                    } else {
                                      return `Adjust ₹${currentDebt.toFixed(2)} from Debt, convert ₹${(unreturnedChange - currentDebt).toFixed(2)} to Store Credit`;
                                    }
                                  }
                                  return `Convert remaining ₹${unreturnedChange.toFixed(2)} to Store Credit`;
                                })()}
                              </span>
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between p-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] space-y-3 overflow-y-auto">
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 rounded-xl border border-sky-500/20 bg-sky-500/5 space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                    <QrCode className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--text-primary)]">Direct QR Code Payment</p>
                    <p className="text-xs text-[var(--text-muted)]">Scan QR on customer screen or EDC device</p>
                  </div>

                  {/* Amount display with Edit Pencil */}
                  <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3.5 py-2 rounded-xl shadow-xs">
                    <span className="text-xs text-[var(--text-muted)] font-semibold">Amount to Collect:</span>
                    {isDirectUpiEditing ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-sky-400 text-sm">₹</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={directUpiCustomAmount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDirectUpiCustomAmount(val);
                            const num = parseFloat(val) || 0;
                            if (num >= effectiveGrandTotalForCollection) {
                              setAutoRecordDebitOnShortfall(false);
                            }
                            if (num <= effectiveGrandTotalForCollection) {
                              setAutoConvertCredit(false);
                            }
                          }}
                          placeholder={effectiveGrandTotalForCollection.toFixed(2)}
                          className="w-24 bg-transparent font-mono text-base font-bold text-[var(--text-primary)] focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setIsDirectUpiEditing(false)}
                          className="p-1 text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
                          title="Done editing UPI amount"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-black text-sky-400">
                          ₹{effectiveDirectUpiAmount.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!directUpiCustomAmount) {
                              setDirectUpiCustomAmount(effectiveGrandTotalForCollection.toString());
                            }
                            setIsDirectUpiEditing(true);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 px-2 py-0.5 rounded-lg transition cursor-pointer"
                          title="Edit UPI Amount"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>{effectiveDirectUpiAmount !== effectiveGrandTotalForCollection ? `₹${effectiveDirectUpiAmount.toFixed(2)}` : "Edit"}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {isDirectUpiEditing && (
                    <div className="flex items-center justify-between text-[11px] w-full max-w-xs pt-1">
                      <span className="text-sky-300/70">
                        Total due: ₹{effectiveGrandTotalForCollection.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDirectUpiCustomAmount(effectiveGrandTotalForCollection.toString());
                          setIsDirectUpiEditing(false);
                          setAutoRecordDebitOnShortfall(false);
                          setAutoConvertCredit(false);
                        }}
                        className="underline hover:text-sky-200 cursor-pointer text-sky-400"
                      >
                        Set Exact (₹{effectiveGrandTotalForCollection.toFixed(2)})
                      </button>
                    </div>
                  )}
                </div>

                {/* Shortfall Card if UPI < Total */}
                {directUpiShortfall > 0 && (
                  <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-sky-400 font-bold font-mono">
                      <span>Shortfall / UPI Deficiency:</span>
                      <span>₹{directUpiShortfall.toFixed(2)} short</span>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] cursor-pointer pt-1 border-t border-sky-500/20">
                      <input
                        type="checkbox"
                        checked={autoRecordDebitOnShortfall}
                        onChange={(e) => setAutoRecordDebitOnShortfall(e.target.checked)}
                        className="rounded h-4 w-4 text-sky-600 focus:ring-sky-500 border-gray-300"
                      />
                      <span className="leading-tight">
                        {(() => {
                          const unusedCr = (customerAnalytics && customerAnalytics.credit_balance !== undefined && customerAnalytics.credit_balance > 0)
                            ? Math.max(0, customerAnalytics.credit_balance - (parseFloat(applyCreditAmount) || 0))
                            : 0;
                          if (unusedCr > 0) {
                            if (directUpiShortfall <= unusedCr) {
                              return `Adjust ₹${directUpiShortfall.toFixed(2)} from Store Credit`;
                            } else {
                              return `Adjust ₹${unusedCr.toFixed(2)} from Store Credit, add remaining ₹${(directUpiShortfall - unusedCr).toFixed(2)} to Customer Debit (Udhaar)`;
                            }
                          }
                          return `Add remaining ₹${directUpiShortfall.toFixed(2)} to Customer Debit (Udhaar)`;
                        })()}
                      </span>
                    </label>
                  </div>
                )}

                {/* Surplus Card if UPI > Total */}
                {directUpiSurplus > 0 && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-emerald-400 font-bold font-mono">
                      <span>Surplus UPI Collected:</span>
                      <span>₹{directUpiSurplus.toFixed(2)} extra</span>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] cursor-pointer pt-1 border-t border-emerald-500/20">
                      <input
                        type="checkbox"
                        checked={autoConvertCredit}
                        onChange={(e) => setAutoConvertCredit(e.target.checked)}
                        className="rounded h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-[var(--border-strong)] bg-[var(--bg-surface)]"
                      />
                      <span className="leading-tight">
                        {(() => {
                          if (customerAnalytics && customerAnalytics.credit_balance !== undefined && customerAnalytics.credit_balance < 0 && !settleDebit) {
                            const currentDebt = Math.abs(customerAnalytics.credit_balance);
                            if (directUpiSurplus <= currentDebt) {
                              return `Adjust ₹${directUpiSurplus.toFixed(2)} from Customer Debt`;
                            } else {
                              return `Adjust ₹${currentDebt.toFixed(2)} from Debt, convert ₹${(directUpiSurplus - currentDebt).toFixed(2)} to Store Credit`;
                            }
                          }
                          return `Convert remaining ₹${directUpiSurplus.toFixed(2)} to Store Credit`;
                        })()}
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Actions Footer (Fixed at Bottom flex-shrink-0) */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--border-subtle)] flex-shrink-0">
              <button
                type="button"
                onClick={onDiscardBill || onClose}
                className="rounded-xl border border-[var(--border-strong)] px-3.5 py-2 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--border-subtle)] transition"
              >
                {editingCompletedBill ? "Cancel Edit" : "Cancel"}
              </button>
              <div className="flex items-center gap-1.5">
                {onOpenDiscountModal && (
                  <button
                    type="button"
                    onClick={() => onOpenDiscountModal(paymentTargetBill)}
                    className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-400 hover:bg-sky-500/20 transition flex items-center gap-1"
                    title="Apply Manager / Staff Discount"
                  >
                    <Percent className="h-3.5 w-3.5 text-sky-400" />
                    <span>Discount</span>
                  </button>
                )}
                {!editingCompletedBill && (
                  <button
                    type="button"
                    onClick={onKeepAsDraft || onClose}
                    className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-bold text-[var(--text-secondary)] hover:border-sky-500/40 hover:text-sky-400 transition flex items-center gap-1"
                    title="Park this bill as draft to resume later"
                  >
                    <Bookmark className="h-3.5 w-3.5" />
                    <span>Keep as Draft</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={!isPaymentValid || isSubmitting}
                  onClick={() => void onSettlePayment()}

                  className="flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-6 py-3 font-bold text-[var(--text-on-accent)] shadow-md hover:opacity-90 disabled:opacity-50 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" />
                  )}
                  <span>{isSubmitting ? "Settling..." : "Mark Paid & Settle"}</span>
                  {isPaymentValid && !isSubmitting && <span className="ml-1 opacity-70 font-mono text-[10px] bg-black/20 px-1.5 rounded">↵</span>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
