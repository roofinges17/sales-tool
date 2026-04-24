"use client";

import VisionAnalysisShell, { matchProduct } from "./VisionAnalysisShell";

export interface MaterialItem {
  material_type: "soffit" | "fascia" | "gutter";
  linear_feet: number;
  damage_severity: "none" | "minor" | "moderate" | "severe";
  color_hex: string;
  recommended_action: string;
  suggested_sku: string | null;
  notes: string;
  confidence: "low" | "medium" | "high";
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

interface MaterialAnalysisProps {
  products: Product[];
  onAddToCart: (items: Array<{ product: Product; quantity: number; materialItem: MaterialItem }>) => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  none: "bg-emerald-900/40 text-emerald-300 border border-emerald-700/30",
  minor: "bg-amber-900/40 text-amber-300 border border-amber-700/30",
  moderate: "bg-orange-900/40 text-orange-300 border border-orange-700/30",
  severe: "bg-red-900/40 text-red-300 border border-red-700/30",
};

const CONFIDENCE_PREFIX: Record<string, string> = { low: "~", medium: "", high: "" };
const MATERIAL_LABEL: Record<string, string> = { soffit: "Soffit", fascia: "Fascia", gutter: "Gutters" };

export default function MaterialAnalysis({ products, onAddToCart }: MaterialAnalysisProps) {
  return (
    <VisionAnalysisShell<MaterialItem>
      title="AI Material Analysis"
      subtitle="(soffit · fascia · gutters)"
      uploadPrompt="Upload up to 4 exterior photos — GPT-4o detects soffit, fascia, and gutter condition, color, and linear footage."
      endpoint="/api/vision/material-detect"
      products={products}
      extractItems={(data) => (data.items as MaterialItem[]) ?? []}
      getQuantity={(item) => item.linear_feet}
      getSku={(item) => item.suggested_sku}
      onAddToCart={(items) =>
        onAddToCart(items.map(({ product, quantity, source }) => ({ product, quantity, materialItem: source })))
      }
      icon={
        <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      }
      renderResult={(item, product) => (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold text-text-primary">
              {MATERIAL_LABEL[item.material_type] ?? item.material_type}
            </span>
            <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 uppercase ${SEVERITY_COLOR[item.damage_severity] ?? ""}`}>
              {item.damage_severity}
            </span>
            <span className="text-[10px] text-text-muted uppercase tracking-wide">{item.confidence} confidence</span>
            <span
              className="inline-block w-4 h-4 rounded-sm border border-border-subtle flex-shrink-0"
              style={{ backgroundColor: item.color_hex }}
              title={item.color_hex}
            />
            <span className="text-[10px] text-text-muted font-mono">{item.color_hex}</span>
          </div>
          <p className="text-[11px] text-text-tertiary">{item.notes}</p>
          <p className="text-[11px] text-text-muted">{item.recommended_action}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs font-medium text-text-secondary">
              {CONFIDENCE_PREFIX[item.confidence]}{item.linear_feet} lf
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
