"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { metersPerPixel, polygonAreaSqft, staticMapUrl } from "@/lib/maps";
import { PITCH_OPTIONS, pitchMultiplier } from "@/lib/pitch";
import { METAL_COLORS, type MetalColor } from "@/lib/metal-colors";

export interface DrawnSection {
  id: string;
  points: { x: number; y: number }[];
  sectionType: "FLAT" | "SLOPED";
  pitch: string;
  productId: string;
  productCode: string;
  productName: string;
  unitPrice: number;
  planarSqft: number;
  actualSqft: number;
  lineTotal: number;
}

interface Product {
  id: string;
  name: string;
  code: string;
  default_price: number;
}

interface Props {
  lat: number;
  lng: number;
  zoom?: number;
  products: Product[];
  sections: DrawnSection[];
  onChange: (sections: DrawnSection[]) => void;
  onClose: () => void;
  onSave?: (compositeDataUrl: string | null, colorId: string | null) => void;
}

const CANVAS_SIZE = 640;
const SCALE = 2;
const IMG_SIZE = CANVAS_SIZE * SCALE; // 1280 — returned by Maps API, displayed at 640

const SECTION_COLORS: Record<string, string> = {
  FLAT: "rgba(59,130,246,0.35)",
  SLOPED: "rgba(249,115,22,0.35)",
};
const STROKE_COLORS: Record<string, string> = {
  FLAT: "rgba(37,99,235,0.9)",
  SLOPED: "rgba(234,88,12,0.9)",
};

// Standing seam panel width in meters (~16.5 inches / 420mm — standard panel)
const SEAM_SPACING_M = 0.42;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function compositeSection(
  ctx: CanvasRenderingContext2D,
  sec: DrawnSection,
  color: MetalColor,
  seamSpacingPx: number
) {
  const pts = sec.points;
  if (pts.length < 3) return;

  const [r, g, b] = hexToRgb(color.hex);

  ctx.save();

  // Clip to polygon
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.clip();

  // Bounding box
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs) - 2;
  const maxX = Math.max(...xs) + 2;
  const minY = Math.min(...ys) - 2;
  const maxY = Math.max(...ys) + 2;

  if (sec.sectionType === "FLAT") {
    // Flat roof: solid tinted fill, no seam pattern
    ctx.fillStyle = `rgba(${r},${g},${b},0.68)`;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  } else {
    // Sloped: base fill + standing seam lines
    ctx.fillStyle = `rgba(${r},${g},${b},0.72)`;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

    // Determine dominant edge direction to orient seam lines
    const w = maxX - minX;
    const h = maxY - minY;
    const vertical = w >= h; // seam lines run vertically when polygon is wider than tall

    const darken = (v: number) => Math.max(0, v - 45);
    const lighten = (v: number) => Math.min(255, v + 30);
    const shadowColor = `rgba(${darken(r)},${darken(g)},${darken(b)},0.90)`;
    const highlightColor = `rgba(${lighten(r)},${lighten(g)},${lighten(b)},0.50)`;

    if (vertical) {
      // Seam lines as vertical stripes
      const startX = minX - ((minX % seamSpacingPx + seamSpacingPx) % seamSpacingPx);
      for (let x = startX; x <= maxX; x += seamSpacingPx) {
        ctx.beginPath();
        ctx.moveTo(x, minY);
        ctx.lineTo(x, maxY);
        ctx.strokeStyle = shadowColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + 1, minY);
        ctx.lineTo(x + 1, maxY);
        ctx.strokeStyle = highlightColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    } else {
      // Seam lines as horizontal stripes
      const startY = minY - ((minY % seamSpacingPx + seamSpacingPx) % seamSpacingPx);
      for (let y = startY; y <= maxY; y += seamSpacingPx) {
        ctx.beginPath();
        ctx.moveTo(minX, y);
        ctx.lineTo(maxX, y);
        ctx.strokeStyle = shadowColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(minX, y + 1);
        ctx.lineTo(maxX, y + 1);
        ctx.strokeStyle = highlightColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

export default function MapDrawingCanvas({
  lat,
  lng,
  zoom = 20,
  products,
  sections,
  onChange,
  onClose,
  onSave,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [activeSection, setActiveSection] = useState<DrawnSection | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const mPerPx = metersPerPixel(lat, zoom, SCALE);
  const seamSpacingPx = SEAM_SPACING_M / mPerPx;
  const mapUrl = staticMapUrl(lat, lng, zoom, CANVAS_SIZE, SCALE);

  useEffect(() => {
    if (!mapUrl) return;
    setImgLoaded(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = mapUrl;
  }, [mapUrl]);

  const selectedColor = METAL_COLORS.find((c) => c.id === selectedColorId) ?? null;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = CANVAS_SIZE;
    const H = CANVAS_SIZE;

    ctx.clearRect(0, 0, W, H);

    // Satellite base image
    if (imgRef.current) {
      ctx.drawImage(imgRef.current, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#666";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(mapUrl ? "Loading satellite image…" : "No Maps API key configured", W / 2, H / 2);
    }

    // For each completed section: composite metal color (if selected), then draw polygon outline + label
    for (const sec of sections) {
      if (sec.points.length < 2) continue;

      // Metal color composite overlay (before polygon stroke so stroke is on top)
      if (selectedColor) {
        compositeSection(ctx, sec, selectedColor, seamSpacingPx);
      } else {
        // Default translucent fill
        const color = SECTION_COLORS[sec.sectionType] ?? SECTION_COLORS.SLOPED;
        ctx.beginPath();
        ctx.moveTo(sec.points[0].x, sec.points[0].y);
        for (let i = 1; i < sec.points.length; i++) ctx.lineTo(sec.points[i].x, sec.points[i].y);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }

      // Polygon outline
      const stroke = STROKE_COLORS[sec.sectionType] ?? STROKE_COLORS.SLOPED;
      ctx.beginPath();
      ctx.moveTo(sec.points[0].x, sec.points[0].y);
      for (let i = 1; i < sec.points.length; i++) ctx.lineTo(sec.points[i].x, sec.points[i].y);
      ctx.closePath();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Area label
      const cx = sec.points.reduce((s, p) => s + p.x, 0) / sec.points.length;
      const cy = sec.points.reduce((s, p) => s + p.y, 0) / sec.points.length;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(sec.actualSqft)} sf`, cx, cy);
    }

    // In-progress polygon
    if (currentPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      for (let i = 1; i < currentPoints.length; i++) ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
      ctx.strokeStyle = "rgba(255,255,0,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const pt of currentPoints) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fillStyle =
          currentPoints.indexOf(pt) === 0 ? "rgba(34,197,94,0.9)" : "rgba(255,255,0,0.9)";
        ctx.fill();
      }
    }
  }, [sections, currentPoints, mapUrl, selectedColor, seamSpacingPx]);

  useEffect(() => {
    draw();
  }, [draw, imgLoaded]);

  function canvasPoint(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_SIZE / rect.width),
      y: (e.clientY - rect.top) * (CANVAS_SIZE / rect.height),
    };
  }

  function isNearStart(pt: { x: number; y: number }) {
    if (currentPoints.length < 3) return false;
    const start = currentPoints[0];
    return Math.hypot(pt.x - start.x, pt.y - start.y) < 14;
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const pt = canvasPoint(e);
    if (isNearStart(pt)) {
      closePolygon();
      return;
    }
    setCurrentPoints((pts) => [...pts, pt]);
  }

  function handleDblClick(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (currentPoints.length >= 3) closePolygon();
  }

  function closePolygon() {
    if (currentPoints.length < 3) return;
    const planar = polygonAreaSqft(currentPoints, mPerPx);
    const defaultProduct = products[0];
    const newSec: DrawnSection = {
      id: uid(),
      points: currentPoints,
      sectionType: "SLOPED",
      pitch: "4:12",
      productId: defaultProduct?.id ?? "",
      productCode: defaultProduct?.code ?? "",
      productName: defaultProduct?.name ?? "",
      unitPrice: defaultProduct?.default_price ?? 0,
      planarSqft: planar,
      actualSqft: planar * pitchMultiplier("4:12"),
      lineTotal: planar * pitchMultiplier("4:12") * (defaultProduct?.default_price ?? 0),
    };
    onChange([...sections, newSec]);
    setCurrentPoints([]);
    setActiveSection(newSec);
  }

  function updateSection(id: string, patch: Partial<DrawnSection>) {
    const updated = sections.map((s) => {
      if (s.id !== id) return s;
      const merged = { ...s, ...patch };
      const mult = merged.sectionType === "FLAT" ? 1 : pitchMultiplier(merged.pitch);
      merged.actualSqft = merged.planarSqft * mult;
      merged.lineTotal = merged.actualSqft * merged.unitPrice;
      return merged;
    });
    onChange(updated);
    const active = updated.find((s) => s.id === id) ?? null;
    setActiveSection(active);
  }

  function deleteSection(id: string) {
    onChange(sections.filter((s) => s.id !== id));
    if (activeSection?.id === id) setActiveSection(null);
  }

  function cancelDraw() {
    setCurrentPoints([]);
  }

  function handleSave() {
    if (sections.length === 0) return;
    const dataUrl = canvasRef.current?.toDataURL("image/png") ?? null;
    if (onSave) onSave(dataUrl, selectedColorId);
    onClose();
  }

  const hasSlopedSections = sections.some((s) => s.sectionType === "SLOPED");

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-surface-1 border border-border-subtle rounded-2xl overflow-hidden max-w-[1100px] w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-surface-2">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-status-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20.502a9 9 0 110-18 9 9 0 010 18zM9 12a3 3 0 100-6 3 3 0 000 6zm6.75 2.25l4.5 4.5" />
            </svg>
            <h2 className="text-heading-sm text-text-primary">Roof Measurement</h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-status-teal/10 text-status-teal border-status-teal/20">
              Satellite
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto flex gap-0 min-h-0">
          {/* Canvas area */}
          <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 p-4 min-w-0">
            <div
              className="relative"
              style={{
                width: CANVAS_SIZE,
                height: CANVAS_SIZE,
                maxWidth: "100%",
                maxHeight: "calc(90vh - 220px)",
              }}
            >
              <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                onClick={handleClick}
                onDoubleClick={handleDblClick}
                className="rounded-lg cursor-crosshair border border-zinc-700"
                style={{ width: "100%", height: "100%" }}
              />
            </div>

            {/* Legend + instructions */}
            <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-500/40 border border-blue-500/70 inline-block" />
                Flat
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-orange-500/40 border border-orange-500/70 inline-block" />
                Sloped
              </span>
              <span>
                · Click to add vertices · Double-click or click start to close ·{" "}
                {currentPoints.length} vertices
              </span>
              {currentPoints.length > 0 && (
                <button
                  onClick={cancelDraw}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  Cancel drawing
                </button>
              )}
            </div>

            {/* Color swatch strip — only shown when there are sloped sections */}
            {hasSlopedSections && (
              <div className="mt-3 w-full max-w-[640px]">
                <p className="text-xs text-zinc-400 mb-2">
                  Metal roof color preview
                  {selectedColor && (
                    <span className="ml-2 text-zinc-200 font-medium">— {selectedColor.name}</span>
                  )}
                </p>
                <div className="flex gap-2">
                  {/* "None" option */}
                  <button
                    onClick={() => setSelectedColorId(null)}
                    title="No color preview"
                    className={`h-8 w-8 rounded-md border-2 flex items-center justify-center text-xs transition-all flex-shrink-0 ${
                      selectedColorId === null
                        ? "border-white scale-110 shadow-lg"
                        : "border-zinc-600 hover:border-zinc-400"
                    } bg-zinc-800 text-zinc-400`}
                  >
                    ×
                  </button>

                  {METAL_COLORS.map((color) => (
                    <button
                      key={color.id}
                      onClick={() => setSelectedColorId(color.id)}
                      title={color.name}
                      className={`h-8 flex-1 rounded-md border-2 transition-all ${
                        selectedColorId === color.id
                          ? "border-white scale-110 shadow-lg shadow-white/20"
                          : "border-transparent hover:border-zinc-400 hover:scale-105"
                      }`}
                      style={{ backgroundColor: color.hex }}
                    />
                  ))}
                </div>
                <div className="flex gap-2 mt-1">
                  <div className="w-8 flex-shrink-0" />
                  {METAL_COLORS.map((color) => (
                    <p
                      key={color.id}
                      className={`flex-1 text-center text-[9px] leading-tight transition-colors ${
                        selectedColorId === color.id ? "text-zinc-200" : "text-zinc-500"
                      }`}
                    >
                      {color.name}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section sidebar */}
          <div className="w-[300px] flex-shrink-0 border-l border-border-subtle overflow-y-auto bg-surface-1">
            <div className="px-4 py-3 border-b border-border-subtle bg-surface-2">
              <h3 className="text-heading-sm text-text-primary">Sections</h3>
              <p className="text-caption text-text-tertiary">{sections.length} drawn</p>
            </div>

            {sections.length === 0 ? (
              <div className="p-6 text-center text-text-muted text-sm">
                <p>No sections yet.</p>
                <p className="text-caption mt-1">Click on the map to draw polygon vertices.</p>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {sections.map((sec) => {
                  const isActive = activeSection?.id === sec.id;
                  return (
                    <div
                      key={sec.id}
                      className={`p-3 cursor-pointer transition-colors ${
                        isActive ? "bg-accent/10 border-l-2 border-accent" : "hover:bg-surface-2"
                      }`}
                      onClick={() => setActiveSection(sec)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            sec.sectionType === "FLAT"
                              ? "bg-blue-500/20 text-blue-300"
                              : "bg-orange-500/20 text-orange-300"
                          }`}
                        >
                          {sec.sectionType}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSection(sec.id);
                          }}
                          className="text-text-muted hover:text-red-400 transition-colors p-0.5"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>

                      {isActive ? (
                        <div
                          className="space-y-2 mt-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div>
                            <label className="text-caption text-text-tertiary block mb-1">
                              Section Type
                            </label>
                            <div className="flex gap-2">
                              {(["FLAT", "SLOPED"] as const).map((t) => (
                                <button
                                  key={t}
                                  onClick={() =>
                                    updateSection(sec.id, {
                                      sectionType: t,
                                      pitch: t === "FLAT" ? "FLAT" : sec.pitch || "4:12",
                                    })
                                  }
                                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                    sec.sectionType === t
                                      ? "bg-accent text-white"
                                      : "bg-surface-3 text-text-secondary hover:bg-surface-2"
                                  }`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>

                          {sec.sectionType === "SLOPED" && (
                            <div>
                              <label className="text-caption text-text-tertiary block mb-1">
                                Pitch
                              </label>
                              <select
                                value={sec.pitch}
                                onChange={(e) =>
                                  updateSection(sec.id, { pitch: e.target.value })
                                }
                                className="w-full h-8 rounded-md border border-border bg-surface-2 px-2 text-xs text-text-primary focus:border-accent focus:outline-none"
                              >
                                {PITCH_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div>
                            <label className="text-caption text-text-tertiary block mb-1">
                              Product
                            </label>
                            <select
                              value={sec.productId}
                              onChange={(e) => {
                                const p = products.find((x) => x.id === e.target.value);
                                if (p)
                                  updateSection(sec.id, {
                                    productId: p.id,
                                    productCode: p.code,
                                    productName: p.name,
                                    unitPrice: p.default_price,
                                  });
                              }}
                              className="w-full h-8 rounded-md border border-border bg-surface-2 px-2 text-xs text-text-primary focus:border-accent focus:outline-none"
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="rounded-md bg-surface-3 p-2 space-y-1 text-xs">
                            <div className="flex justify-between text-text-tertiary">
                              <span>Planar area</span>
                              <span>{Math.round(sec.planarSqft)} sf</span>
                            </div>
                            {sec.sectionType === "SLOPED" && (
                              <div className="flex justify-between text-text-tertiary">
                                <span>× {pitchMultiplier(sec.pitch).toFixed(3)} (pitch)</span>
                                <span>{Math.round(sec.actualSqft)} sf actual</span>
                              </div>
                            )}
                            <div className="flex justify-between text-text-primary font-semibold border-t border-border-subtle pt-1 mt-1">
                              <span>Line total</span>
                              <span>${sec.lineTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-text-tertiary mt-1 space-y-0.5">
                          <p>
                            {Math.round(sec.actualSqft)} sf ·{" "}
                            {sec.pitch !== "FLAT" ? sec.pitch : "flat"}
                          </p>
                          <p className="text-text-secondary font-medium">
                            ${sec.lineTotal.toFixed(2)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="p-4 border-t border-border-subtle">
              <div className="text-xs text-text-tertiary mb-2">
                Total:{" "}
                <span className="text-text-primary font-semibold">
                  ${sections.reduce((s, x) => s + x.lineTotal, 0).toFixed(2)}
                </span>
                {" · "}
                {Math.round(sections.reduce((s, x) => s + x.actualSqft, 0))} sf
              </div>
              {selectedColor && (
                <div className="flex items-center gap-2 mb-2 text-xs text-text-tertiary">
                  <span
                    className="inline-block w-3 h-3 rounded-sm border border-zinc-600 flex-shrink-0"
                    style={{ backgroundColor: selectedColor.hex }}
                  />
                  <span>{selectedColor.name}</span>
                </div>
              )}
              <button
                onClick={handleSave}
                disabled={sections.length === 0}
                className="w-full py-2 rounded-md bg-gradient-to-r from-accent to-status-teal text-white text-sm font-medium disabled:opacity-40 hover:brightness-110 transition-all"
              >
                Save {sections.length} Section{sections.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
