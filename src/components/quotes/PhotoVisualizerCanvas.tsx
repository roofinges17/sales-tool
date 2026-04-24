"use client";

// Photo visualizer — draw polygons on a house photo and HSL-shift the selected roof color
// into the polygon region, preserving luminance for realism.
// Mobile-first: 24px touch targets on vertices.

import { useRef, useEffect, useState, useCallback } from "react";
import { METAL_COLORS, type MetalColor } from "@/lib/metal-colors";

const CANVAS_W = 800;
const CANVAS_H = 600;
const VERTEX_R = 12; // 24px diameter — minimum touch target

interface Point { x: number; y: number; }
interface Polygon { id: string; points: Point[]; }

interface Props {
  imageUrl: string;
  initialColorId?: string | null;
  onExport: (dataUrl: string, colorId: string) => void;
}

// ── Color math ────────────────────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    case b: h = (r - g) / d + 4; break;
  }
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  function toC(t: number) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 0.5) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  return [
    Math.round(toC(h + 1 / 3) * 255),
    Math.round(toC(h) * 255),
    Math.round(toC(h - 1 / 3) * 255),
  ];
}

function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return rgbToHsl(r, g, b);
}

// ── Geometry ──────────────────────────────────────────────────────────────────

function pointInPolygon(x: number, y: number, pts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Component ─────────────────────────────────────────────────────────────────

export default function PhotoVisualizerCanvas({ imageUrl, initialColorId, onExport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [polygons, setPolygons] = useState<Polygon[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [selectedColorId, setSelectedColorId] = useState<string>(
    initialColorId ?? METAL_COLORS[0].id
  );
  const [saving, setSaving] = useState(false);

  const selectedColor = METAL_COLORS.find((c) => c.id === selectedColorId) ?? METAL_COLORS[0];

  // Load image
  useEffect(() => {
    if (!imageUrl) return;
    setImgLoaded(false);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
    img.src = imageUrl;
  }, [imageUrl]);

  // ── HSL-shift colorize on the canvas ────────────────────────────────────────

  const colorizePolygon = useCallback(
    (ctx: CanvasRenderingContext2D, pts: Point[], color: MetalColor) => {
      if (pts.length < 3) return;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const x0 = Math.max(0, Math.floor(Math.min(...xs)));
      const y0 = Math.max(0, Math.floor(Math.min(...ys)));
      const x1 = Math.min(CANVAS_W, Math.ceil(Math.max(...xs)));
      const y1 = Math.min(CANVAS_H, Math.ceil(Math.max(...ys)));
      const w = x1 - x0, h = y1 - y0;
      if (w <= 0 || h <= 0) return;

      const [tH, tS] = hexToHsl(color.hex);
      const imageData = ctx.getImageData(x0, y0, w, h);
      const d = imageData.data;

      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          if (!pointInPolygon(px + x0, py + y0, pts)) continue;
          const i = (py * w + px) * 4;
          const [, , l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
          // Blend: 80% target saturation, preserve luminance
          const [nr, ng, nb] = hslToRgb(tH, Math.min(1, tS * 0.85), l);
          d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
        }
      }
      ctx.putImageData(imageData, x0, y0);
    },
    []
  );

  // ── Main draw ────────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Photo background
    if (imgRef.current) {
      // Scale to fit canvas maintaining aspect ratio
      const img = imgRef.current;
      const scale = Math.min(CANVAS_W / img.naturalWidth, CANVAS_H / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      const dx = (CANVAS_W - dw) / 2, dy = (CANVAS_H - dh) / 2;
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // HSL-shift completed polygons
    for (const poly of polygons) {
      if (poly.points.length >= 3) {
        colorizePolygon(ctx, poly.points, selectedColor);
      }
    }

    // Draw polygon outlines + vertices
    const drawPoly = (pts: Point[], closed: boolean, strokeColor: string) => {
      if (pts.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (closed) ctx.closePath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.setLineDash(closed ? [] : [6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Vertices
      pts.forEach((pt, idx) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, VERTEX_R, 0, Math.PI * 2);
        const isStart = idx === 0 && pts.length >= 3;
        ctx.fillStyle = isStart ? "rgba(34,197,94,0.85)" : "rgba(255,255,255,0.75)";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    };

    for (const poly of polygons) {
      drawPoly(poly.points, true, "rgba(255,255,255,0.9)");
    }
    if (currentPoints.length > 0) {
      drawPoly(currentPoints, false, "rgba(255,220,50,0.9)");
    }
  }, [polygons, currentPoints, selectedColor, colorizePolygon]);

  useEffect(() => { draw(); }, [draw, imgLoaded]);

  // ── Coordinate helpers ───────────────────────────────────────────────────────

  function canvasPoint(clientX: number, clientY: number): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (CANVAS_W / rect.width),
      y: (clientY - rect.top) * (CANVAS_H / rect.height),
    };
  }

  function isNearStart(pt: Point): boolean {
    if (currentPoints.length < 3) return false;
    const s = currentPoints[0];
    return Math.hypot(pt.x - s.x, pt.y - s.y) < VERTEX_R * 2;
  }

  function closePolygon() {
    if (currentPoints.length < 3) return;
    setPolygons((p) => [...p, { id: uid(), points: currentPoints }]);
    setCurrentPoints([]);
  }

  // ── Mouse events ─────────────────────────────────────────────────────────────

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const pt = canvasPoint(e.clientX, e.clientY);
    if (isNearStart(pt)) { closePolygon(); return; }
    setCurrentPoints((p) => [...p, pt]);
  }

  function handleDblClick(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (currentPoints.length >= 3) closePolygon();
  }

  // ── Touch events ──────────────────────────────────────────────────────────────

  function handleTouchEnd(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    const pt = canvasPoint(touch.clientX, touch.clientY);
    if (isNearStart(pt)) { closePolygon(); return; }
    setCurrentPoints((p) => [...p, pt]);
  }

  // ── Actions ───────────────────────────────────────────────────────────────────

  function deleteLastPolygon() {
    setPolygons((p) => p.slice(0, -1));
  }

  function cancelDraw() { setCurrentPoints([]); }

  function handleExport() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    // Redraw without vertex handles for clean export
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      // Clear and redraw photo + colorized regions only
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      if (imgRef.current) {
        const img = imgRef.current;
        const scale = Math.min(CANVAS_W / img.naturalWidth, CANVAS_H / img.naturalHeight);
        const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
        const dx = (CANVAS_W - dw) / 2, dy = (CANVAS_H - dh) / 2;
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.drawImage(img, dx, dy, dw, dh);
      }
      for (const poly of polygons) {
        if (poly.points.length >= 3) colorizePolygon(ctx, poly.points, selectedColor);
      }
    }
    const dataUrl = canvas.toDataURL("image/png");
    onExport(dataUrl, selectedColorId);
    // Restore with handles
    draw();
    setSaving(false);
  }

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Temp clean render
    const offscreen = document.createElement("canvas");
    offscreen.width = CANVAS_W;
    offscreen.height = CANVAS_H;
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });
    if (ctx && imgRef.current) {
      const img = imgRef.current;
      const scale = Math.min(CANVAS_W / img.naturalWidth, CANVAS_H / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      const dx = (CANVAS_W - dw) / 2, dy = (CANVAS_H - dh) / 2;
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(img, dx, dy, dw, dh);
      for (const poly of polygons) {
        if (poly.points.length >= 3) colorizePolygon(ctx, poly.points, selectedColor);
      }
    }
    const dataUrl = offscreen.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `roof-visualizer-${selectedColor.id.toLowerCase()}.png`;
    a.click();
  }

  const canSave = polygons.length > 0;

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div className="relative rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onClick={handleClick}
          onDoubleClick={handleDblClick}
          onTouchEnd={handleTouchEnd}
          className="w-full cursor-crosshair touch-none"
          style={{ maxHeight: "60vh", objectFit: "contain" }}
        />
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
            Loading image…
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
        <span>Tap/click to place vertices</span>
        <span>·</span>
        <span>Double-tap or tap start point (green) to close</span>
        <span>·</span>
        <span>{currentPoints.length} vertices in progress</span>
        {currentPoints.length > 0 && (
          <button onClick={cancelDraw} className="text-red-400 hover:text-red-300 transition-colors">
            Cancel
          </button>
        )}
        {polygons.length > 0 && (
          <button onClick={deleteLastPolygon} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            Undo last region
          </button>
        )}
      </div>

      {/* Color picker */}
      <div>
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
          Roof Color — <span className="normal-case font-semibold text-zinc-200">{selectedColor.name}</span>
        </p>
        <div className="flex gap-2 flex-wrap">
          {METAL_COLORS.map((color) => (
            <button
              key={color.id}
              onClick={() => setSelectedColorId(color.id)}
              title={color.name}
              className={`h-11 flex-1 min-w-[2.5rem] rounded-lg border-2 transition-all ${
                selectedColorId === color.id
                  ? "border-white scale-110 shadow-lg shadow-white/10"
                  : "border-transparent hover:border-zinc-400 hover:scale-105"
              }`}
              style={{ backgroundColor: color.hex }}
            />
          ))}
        </div>
        <div className="flex gap-2 flex-wrap mt-1">
          {METAL_COLORS.map((color) => (
            <p
              key={color.id}
              className={`flex-1 min-w-[2.5rem] text-center text-[9px] leading-tight transition-colors ${
                selectedColorId === color.id ? "text-zinc-200" : "text-zinc-600"
              }`}
            >
              {color.name}
            </p>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleDownload}
          disabled={!canSave}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download PNG
        </button>
        <button
          onClick={handleExport}
          disabled={!canSave || saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {saving ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
          )}
          Save to Quote
        </button>
      </div>
    </div>
  );
}
