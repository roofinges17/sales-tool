"use client";

import VisionAnalysisShell, { matchProduct } from "./VisionAnalysisShell";

export interface DamageItem {
  damage_type: string;
  severity: "minor" | "moderate" | "severe";
  location: string;
  recommended_action: string;
  estimated_quantity: number;
  unit: string;
  suggested_sku: string | null;
}

interface Product {
  id: string;
  name: string;
  code?: string | null;
  default_price?: number | null;
  price?: number | null;
  cost?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  unit?: string | null;
  product_type: "PRODUCT" | "SERVICE";
}

interface DamageAnalysisProps {
  products: Product[];
  onAddToCart: (items: Array<{ product: Product; quantity: number; damageItem: DamageItem }>) => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  minor: "bg-amber-900/40 text-amber-300 border border-amber-700/30",
  moderate: "bg-orange-900/40 text-orange-300 border border-orange-700/30",
  severe: "bg-red-900/40 text-red-300 border border-red-700/30",
};

export default function DamageAnalysis({ products, onAddToCart }: DamageAnalysisProps) {
  return (
    <VisionAnalysisShell<DamageItem>
      title="AI Damage Analysis"
      subtitle="(optional)"
      uploadPrompt="Upload up to 4 roof photos — GPT-4o will detect damage and suggest line items."
      endpoint="/api/vision/damage-detect"
      products={products}
      extractItems={(data) => (data.items as DamageItem[]) ?? []}
      getQuantity={(item) => item.estimated_quantity}
      getSku={(item) => item.suggested_sku}
      onAddToCart={(items) =>
        onAddToCart(items.map(({ product, quantity, source }) => ({ product, quantity, damageItem: source })))
      }
      icon={
        <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      }
      renderResult={(item, product) => (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold text-text-primary">{item.damage_type}</span>
            <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 uppercase ${SEVERITY_COLOR[item.severity] ?? ""}`}>
              {item.severity}
            </span>
          </div>
          <p className="text-[11px] text-text-tertiary">{item.location}</p>
          <p className="text-[11px] text-text-muted">{item.recommended_action}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs font-medium text-text-secondary">
              {item.estimated_quantity} {item.unit}
            </span>
            {product ? (
              <span className="text-[10px] text-status-green">→ {product.name}</span>
            ) : (
              <span className="text-[10px] text-text-muted">→ no product match</span>
            )}
          </div>
        </>
      )}
    />
  );
}
