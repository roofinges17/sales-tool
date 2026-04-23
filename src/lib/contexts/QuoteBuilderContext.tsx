"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export interface CartItem {
  product_id: string;
  product_name: string;
  product_sku?: string | null;
  product_description?: string | null;
  quantity: number;
  unit_price: number;
  unit_cost?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  default_price?: number | null;
  product_type: "PRODUCT" | "SERVICE";
  unit?: string | null;
  line_total: number;
}

export interface NewCustomer {
  name: string;
  email: string;
  phone: string;
  billing_address_line1: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  lead_source: string;
}

export interface FinancingPlan {
  id: string;
  name: string;
  provider_name: string;
  term_months: number;
  apr: number;
  dealer_fee_percentage: number;
}

export interface QuoteBuilderState {
  step: number;
  departmentId: string | null;
  departmentName: string | null;
  cart: CartItem[];
  existingAccountId: string | null;
  existingAccountName: string | null;
  isNewCustomer: boolean;
  newCustomer: NewCustomer;
  discountType: "PERCENTAGE" | "FIXED" | null;
  discountValue: number;
  taxRate: number;
  validDays: number;
  notes: string;
  financingPlanId: string | null;
  selectedFinancingPlan: FinancingPlan | null;
  useFinancing: boolean;
}

export interface CommissionSummary {
  sellerMarkup: number;
  baseProfit: number;
  managerCommission: number;
  ownerCommission: number;
}

interface QuoteBuilderContextValue {
  state: QuoteBuilderState;
  setStep: (step: number) => void;
  setDepartment: (id: string, name: string) => void;
  addToCart: (item: Omit<CartItem, "line_total">) => void;
  removeFromCart: (productId: string) => void;
  updateCartQty: (productId: string, qty: number) => void;
  updateCartPrice: (productId: string, price: number) => void;
  setExistingAccount: (id: string, name: string) => void;
  setIsNewCustomer: (v: boolean) => void;
  setNewCustomer: (c: Partial<NewCustomer>) => void;
  setDiscount: (type: "PERCENTAGE" | "FIXED" | null, value: number) => void;
  setTaxRate: (rate: number) => void;
  setValidDays: (days: number) => void;
  setNotes: (n: string) => void;
  setFinancing: (plan: FinancingPlan | null, useFinancing: boolean) => void;
  subtotal: number;
  discountAmount: number;
  dealerFee: number;
  taxAmount: number;
  total: number;
  monthlyPayment: number;
  commissions: CommissionSummary;
  reset: () => void;
}

const defaultState: QuoteBuilderState = {
  step: 1,
  departmentId: null,
  departmentName: null,
  cart: [],
  existingAccountId: null,
  existingAccountName: null,
  isNewCustomer: false,
  newCustomer: {
    name: "",
    email: "",
    phone: "",
    billing_address_line1: "",
    billing_city: "",
    billing_state: "",
    billing_zip: "",
    lead_source: "",
  },
  discountType: null,
  discountValue: 0,
  taxRate: 0.07,
  validDays: 30,
  notes: "",
  financingPlanId: null,
  selectedFinancingPlan: null,
  useFinancing: false,
};

const QuoteBuilderContext = createContext<QuoteBuilderContextValue | null>(null);

export function QuoteBuilderProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<QuoteBuilderState>(defaultState);

  const setStep = useCallback((step: number) => setState((s) => ({ ...s, step })), []);

  const setDepartment = useCallback((id: string, name: string) => {
    setState((s) => ({ ...s, departmentId: id, departmentName: name, cart: [] }));
  }, []);

  const addToCart = useCallback((item: Omit<CartItem, "line_total">) => {
    setState((s) => {
      const existing = s.cart.find((c) => c.product_id === item.product_id);
      if (existing) {
        return {
          ...s,
          cart: s.cart.map((c) =>
            c.product_id === item.product_id
              ? { ...c, quantity: c.quantity + 1, line_total: (c.quantity + 1) * c.unit_price }
              : c
          ),
        };
      }
      return {
        ...s,
        cart: [...s.cart, { ...item, line_total: item.quantity * item.unit_price }],
      };
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setState((s) => ({ ...s, cart: s.cart.filter((c) => c.product_id !== productId) }));
  }, []);

  const updateCartQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) return;
    setState((s) => ({
      ...s,
      cart: s.cart.map((c) =>
        c.product_id === productId
          ? { ...c, quantity: qty, line_total: qty * c.unit_price }
          : c
      ),
    }));
  }, []);

  const updateCartPrice = useCallback((productId: string, price: number) => {
    setState((s) => ({
      ...s,
      cart: s.cart.map((c) => {
        if (c.product_id !== productId) return c;
        const min = c.min_price ?? 0;
        const max = c.max_price ?? Infinity;
        const clamped = Math.min(Math.max(price, min), max);
        return { ...c, unit_price: clamped, line_total: c.quantity * clamped };
      }),
    }));
  }, []);

  const setExistingAccount = useCallback((id: string, name: string) => {
    setState((s) => ({ ...s, existingAccountId: id, existingAccountName: name, isNewCustomer: false }));
  }, []);

  const setIsNewCustomer = useCallback((v: boolean) => {
    setState((s) => ({ ...s, isNewCustomer: v, existingAccountId: null, existingAccountName: null }));
  }, []);

  const setNewCustomer = useCallback((c: Partial<NewCustomer>) => {
    setState((s) => ({ ...s, newCustomer: { ...s.newCustomer, ...c } }));
  }, []);

  const setDiscount = useCallback((type: "PERCENTAGE" | "FIXED" | null, value: number) => {
    setState((s) => ({ ...s, discountType: type, discountValue: value }));
  }, []);

  const setTaxRate = useCallback((rate: number) => {
    setState((s) => ({ ...s, taxRate: rate }));
  }, []);

  const setValidDays = useCallback((days: number) => {
    setState((s) => ({ ...s, validDays: days }));
  }, []);

  const setNotes = useCallback((n: string) => {
    setState((s) => ({ ...s, notes: n }));
  }, []);

  const setFinancing = useCallback((plan: FinancingPlan | null, useFinancing: boolean) => {
    setState((s) => ({
      ...s,
      selectedFinancingPlan: plan,
      financingPlanId: plan?.id ?? null,
      useFinancing,
    }));
  }, []);

  const reset = useCallback(() => setState(defaultState), []);

  // Computed values
  const subtotal = state.cart.reduce((sum, item) => sum + item.line_total, 0);

  const discountAmount =
    state.discountType === "PERCENTAGE"
      ? subtotal * (state.discountValue / 100)
      : state.discountType === "FIXED"
      ? state.discountValue
      : 0;

  const dealerFee =
    state.useFinancing && state.selectedFinancingPlan
      ? (subtotal - discountAmount) * (state.selectedFinancingPlan.dealer_fee_percentage / 100)
      : 0;

  const afterDiscount = subtotal - discountAmount + dealerFee;
  const taxAmount = afterDiscount * state.taxRate;
  const total = afterDiscount + taxAmount;

  // Monthly payment: P × r(1+r)^n / ((1+r)^n - 1)
  const monthlyPayment = (() => {
    if (!state.useFinancing || !state.selectedFinancingPlan) return 0;
    const P = total;
    const n = state.selectedFinancingPlan.term_months;
    const annualRate = state.selectedFinancingPlan.apr / 100;
    if (annualRate === 0) return P / n;
    const r = annualRate / 12;
    return (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  })();

  // Commission math (exact from SPEC section 10)
  const sellerMarkup = state.cart
    .filter((item) => item.product_type === "PRODUCT")
    .reduce((sum, item) => sum + (item.unit_price - (item.min_price ?? item.unit_price)) * item.quantity, 0);

  const baseProfit = state.cart.reduce(
    (sum, item) => sum + ((item.min_price ?? item.unit_price) - (item.unit_cost ?? 0)) * item.quantity,
    0
  );

  const commissions: CommissionSummary = {
    sellerMarkup,
    baseProfit,
    managerCommission: baseProfit * 0.18,
    ownerCommission: baseProfit * 0.05,
  };

  const value: QuoteBuilderContextValue = {
    state,
    setStep,
    setDepartment,
    addToCart,
    removeFromCart,
    updateCartQty,
    updateCartPrice,
    setExistingAccount,
    setIsNewCustomer,
    setNewCustomer,
    setDiscount,
    setTaxRate,
    setValidDays,
    setNotes,
    setFinancing,
    subtotal,
    discountAmount,
    dealerFee,
    taxAmount,
    total,
    monthlyPayment,
    commissions,
    reset,
  };

  return <QuoteBuilderContext.Provider value={value}>{children}</QuoteBuilderContext.Provider>;
}

export function useQuoteBuilder() {
  const ctx = useContext(QuoteBuilderContext);
  if (!ctx) throw new Error("useQuoteBuilder must be used within QuoteBuilderProvider");
  return ctx;
}
