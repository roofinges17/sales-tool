export interface MetalColor {
  id: string;
  name: string;
  hex: string;
}

// 7 standard South Florida metal roof colors (Mueller / ABC / Central States palette)
export const METAL_COLORS: MetalColor[] = [
  { id: "DARK_BRONZE",   name: "Dark Bronze",   hex: "#3D2B1F" },
  { id: "MATTE_BLACK",   name: "Matte Black",   hex: "#1C1C1C" },
  { id: "CHARCOAL_GRAY", name: "Charcoal Gray", hex: "#3F3F3F" },
  { id: "MANSARD_BROWN", name: "Mansard Brown", hex: "#5C4033" },
  { id: "SLATE_GRAY",    name: "Slate Gray",    hex: "#6A7280" },
  { id: "DOVE_GRAY",     name: "Dove Gray",     hex: "#8A8785" },
  { id: "BRIGHT_WHITE",  name: "Bright White",  hex: "#F0EBE3" },
];

export function findColor(id: string): MetalColor | undefined {
  return METAL_COLORS.find((c) => c.id === id);
}
