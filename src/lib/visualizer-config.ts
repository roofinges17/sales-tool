export interface EnglertColor {
  name: string;
  hex: string;
  isBestSeller: boolean;
}

// Starred best-sellers confirmed by Alejandro 2026-04-24 (render at top of picker)
// Extended palette sourced from Englert product line; full chart pending PDF extraction
export const ENGLERT_COLORS: EnglertColor[] = [
  // ── Best-sellers (starred) ────────────────────────────────────────────────
  { name: "Matte Black",    hex: "#1C1C1C", isBestSeller: true },
  { name: "Charcoal Gray",  hex: "#3F3F3F", isBestSeller: true },
  { name: "Mansard Brown",  hex: "#5C4033", isBestSeller: true },
  { name: "Dark Bronze",    hex: "#3D2B1F", isBestSeller: true },
  { name: "Dove Gray",      hex: "#8A8785", isBestSeller: true },
  { name: "Slate Gray",     hex: "#6A7280", isBestSeller: true },
  { name: "Bone White",     hex: "#E8E3D7", isBestSeller: true },
  { name: "Terracotta",     hex: "#C87941", isBestSeller: true },
  // ── Extended Englert palette ──────────────────────────────────────────────
  { name: "Classic White",  hex: "#F0EBE3", isBestSeller: false },
  { name: "Burnished Slate",hex: "#5B6673", isBestSeller: false },
  { name: "Hartford Green", hex: "#2E4A3A", isBestSeller: false },
  { name: "Patina Green",   hex: "#5F7A5F", isBestSeller: false },
  { name: "Colonial Red",   hex: "#8B2C2C", isBestSeller: false },
  { name: "Sierra Tan",     hex: "#C4A882", isBestSeller: false },
  { name: "Copper Penny",   hex: "#AD6F69", isBestSeller: false },
  { name: "Aztec Gold",     hex: "#C19A6B", isBestSeller: false },
  { name: "Sandstone",      hex: "#C9B99A", isBestSeller: false },
  { name: "Weathered Zinc", hex: "#7A8B8B", isBestSeller: false },
];

// Product codes that trigger the required roof_color picker in Step2
export const METAL_ROOF_CODES = ["ALUMINUM", "METAL"];

export const VISUALIZER_FINISHES = ["Matte", "Satin", "Textured"] as const;
export type VisualizerFinish = typeof VISUALIZER_FINISHES[number];

export function findEnglertColor(name: string): EnglertColor | undefined {
  return ENGLERT_COLORS.find((c) => c.name === name);
}
