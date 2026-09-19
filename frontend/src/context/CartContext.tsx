"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { CartItem, MenuItem, OrderResponse, PaymentMode, Variant } from "@/types";

interface CartContextType {
  cart: CartItem[];
  tableNumber: string;
  setTableNumber: (table: string) => void;
  paymentMode: PaymentMode;
  setPaymentMode: (mode: PaymentMode) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  addToCart: (menuItem: MenuItem, selectedVariant?: Variant | null) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  clearCart: () => void;
  totalAmount: number;
  totalItemCount: number;
  activeOrder: OrderResponse | null;
  setActiveOrder: (order: OrderResponse | null) => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  isTicketOpen: boolean;
  setIsTicketOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableNumber, setTableNumber] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("PAY_AT_COUNTER");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [activeOrder, setActiveOrder] = useState<OrderResponse | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isTicketOpen, setIsTicketOpen] = useState(false);

  // Initialize theme from system preference or localStorage
  useEffect(() => {
    const applyTheme = (t: "light" | "dark") => {
      document.documentElement.setAttribute("data-theme", t);
      if (t === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };

    const storedTheme = localStorage.getItem("app_theme") as "light" | "dark" | null;
    if (storedTheme) {
      setTheme(storedTheme);
      applyTheme(storedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
      applyTheme("dark");
    } else {
      setTheme("light");
      applyTheme("light");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("app_theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const addToCart = (menuItem: MenuItem, selectedVariant?: Variant | null) => {
    const effectivePrice = menuItem.is_on_offer && menuItem.offer_price
      ? parseFloat(menuItem.offer_price)
      : parseFloat(menuItem.price);
    const delta = selectedVariant ? parseFloat(selectedVariant.price_delta) : 0;
    const unitPrice = effectivePrice + delta;
    const variantId = selectedVariant ? selectedVariant.id : "no-var";
    const cartItemId = `${menuItem.id}-${variantId}`;

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.cartItemId === cartItemId);
      if (existing) {
        return prevCart.map((item) =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prevCart,
        {
          cartItemId,
          menuItem,
          selectedVariant,
          quantity: 1,
          unitPrice,
        },
      ];
    });
  };

  const removeFromCart = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.cartItemId === cartItemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const clearCart = () => setCart([]);

  const totalAmount = cart.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  const totalItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        tableNumber,
        setTableNumber,
        paymentMode,
        setPaymentMode,
        theme,
        toggleTheme,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalAmount,
        totalItemCount,
        activeOrder,
        setActiveOrder,
        isCartOpen,
        setIsCartOpen,
        isTicketOpen,
        setIsTicketOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
