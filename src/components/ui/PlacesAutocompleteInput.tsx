"use client";

import { useEffect, useRef } from "react";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_STATIC_KEY ?? "";

// window-level singleton — survives across Next.js code-split chunks.
declare global {
  interface Window {
    __roofingPlacesLib?: Promise<google.maps.PlacesLibrary>;
  }
}

function getPlacesLib(): Promise<google.maps.PlacesLibrary> {
  if (window.__roofingPlacesLib) return window.__roofingPlacesLib;
  window.__roofingPlacesLib = import("@googlemaps/js-api-loader").then(
    ({ setOptions, importLibrary }) => {
      setOptions({ key: MAPS_KEY, v: "weekly" });
      return importLibrary("places") as Promise<google.maps.PlacesLibrary>;
    },
  );
  return window.__roofingPlacesLib;
}

export interface PlaceResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface PlacesAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

// Searches the element's shadow DOM (and one level of nested shadow roots) for
// the internal <input>. Google nests it inside a sub-element on some builds.
function findShadowInput(el: Element): HTMLInputElement | null {
  // Direct match
  const direct = el.shadowRoot?.querySelector<HTMLInputElement>("input");
  if (direct) return direct;
  // One level deeper — e.g. <gmp-internal-input> inside the shadow root
  const nestedHosts = el.shadowRoot?.querySelectorAll("*") ?? [];
  for (const host of nestedHosts) {
    if (host.shadowRoot) {
      const nested = host.shadowRoot.querySelector<HTMLInputElement>("input");
      if (nested) return nested;
    }
  }
  return null;
}

export function PlacesAutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder = "Enter address…",
  className,
  disabled,
  autoFocus = false,
}: PlacesAutocompleteInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elementRef = useRef<any>(null);

  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelect);
  onChangeRef.current = onChange;
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!MAPS_KEY || !containerRef.current) return;
    let cancelled = false;

    getPlacesLib().then(async (placesLib) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib = placesLib as any;
      if (cancelled || !containerRef.current || elementRef.current) return;
      if (!lib.PlaceAutocompleteElement) {
        console.error(
          "[PlacesAutocomplete] PlaceAutocompleteElement not available — " +
          "ensure Maps JavaScript API is enabled in GCP for this key.",
        );
        return;
      }

      const pac = new lib.PlaceAutocompleteElement({
        types: ["address"],
        componentRestrictions: { country: "us" },
      });

      pac.style.cssText = "display:block;width:100%;height:100%;";
      elementRef.current = pac;
      containerRef.current.appendChild(pac);

      // Native input events from the shadow <input> are composed and bubble
      // through the shadow boundary — listen on the outer element for keystrokes.
      pac.addEventListener("input", (e: Event) => {
        onChangeRef.current((e.target as HTMLInputElement).value);
      });

      // Placeholder + autoFocus require the internal shadow input.
      // Use MutationObserver to wait for it; fall back to rAF.
      const wireShadowInput = () => {
        const inner = findShadowInput(pac);
        if (inner) {
          inner.placeholder = placeholder;
          if (autoFocus) inner.focus();
        } else {
          // Try focusing the outer element as a best-effort autoFocus fallback.
          if (autoFocus) {
            try { pac.focus(); } catch (_) { /* noop */ }
          }
          console.error(
            "[PlacesAutocomplete] Shadow input not found — placeholder unavailable. " +
            "Google may have restructured PlaceAutocompleteElement internals.",
          );
        }
      };

      if (findShadowInput(pac)) {
        wireShadowInput();
      } else {
        const mo = new MutationObserver(() => {
          if (findShadowInput(pac)) { mo.disconnect(); wireShadowInput(); }
        });
        mo.observe(pac, { childList: true, subtree: true });
        requestAnimationFrame(() => { if (!cancelled) wireShadowInput(); });
      }

      // Place selected — current Google API fires 'gmp-select' with a
      // placePrediction object. Also listen to 'gmp-placeselect' and the
      // legacy 'gmp-placeautocomplete-placechange' to cover API version drift.
      // Console.log on each so the first real-browser test reveals which fires.
      const handleSelection = async (placePrediction: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!placePrediction) {
          console.warn("[PlacesAutocomplete] handleSelection called with no placePrediction");
          return;
        }
        const place = placePrediction.toPlace ? placePrediction.toPlace() : placePrediction;
        await place.fetchFields({ fields: ["location", "formattedAddress"] });
        const lat: number = place.location.lat();
        const lng: number = place.location.lng();
        const formattedAddress: string = place.formattedAddress ?? "";
        console.log("[PlacesAutocomplete] onSelect fired:", formattedAddress);
        onChangeRef.current(formattedAddress);
        onSelectRef.current({ lat, lng, formattedAddress });
      };

      // Primary event (current API, 2024+)
      pac.addEventListener("gmp-select", async (e: Event) => {
        console.log("[PlacesAutocomplete] gmp-select fired");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await handleSelection((e as any).placePrediction);
      });

      // Alternate name used in some API versions
      pac.addEventListener("gmp-placeselect", async (e: Event) => {
        console.log("[PlacesAutocomplete] gmp-placeselect fired");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await handleSelection((e as any).placePrediction);
      });

      // Legacy event name — kept as belt-and-suspenders
      pac.addEventListener("gmp-placeautocomplete-placechange", async () => {
        console.log("[PlacesAutocomplete] gmp-placeautocomplete-placechange fired");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const place = pac.value as any;
        if (!place || typeof place.fetchFields !== "function") {
          console.warn("[PlacesAutocomplete] pac.value is not a Place object — skipping");
          return;
        }
        await handleSelection(place);
      });
    });

    return () => {
      cancelled = true;
      if (elementRef.current) {
        elementRef.current.remove();
        elementRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value resets to shadow input.
  useEffect(() => {
    if (!elementRef.current) return;
    const inner = findShadowInput(elementRef.current);
    if (inner && inner.value !== value) inner.value = value;
  }, [value]);

  // Container is sized only (flex/width). PlaceAutocompleteElement owns all
  // visual chrome (input box border, bg, dropdown) via --gmpx-* custom props.
  // No border/bg/overflow on the container — those were for the old plain input.
  const defaultClass = "flex-1 relative";

  if (!MAPS_KEY) {
    return (
      <input
        type="text"
        disabled
        placeholder="Maps API key not configured"
        className={
          className ??
          "flex-1 h-10 rounded-lg border border-border bg-surface-2 px-4 text-sm text-text-primary"
        }
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={className ?? defaultClass}
      style={
        {
          // --gmpx-* are Google's documented theming surface for PlaceAutocompleteElement.
          // Real colors (not transparent) so the dropdown is visible on dark backgrounds.
          "--gmpx-color-surface": "#18181b",               // zinc-900 — input bg
          "--gmpx-color-on-surface": "#f4f4f5",            // zinc-100 — input text
          "--gmpx-color-on-surface-variant": "#a1a1aa",    // zinc-400 — placeholder
          "--gmpx-color-outline": "#3f3f46",               // zinc-700 — input border
          "--gmpx-color-primary": "#818cf8",               // indigo-400 — focus/accent
          "--gmpx-color-surface-container": "#27272a",     // zinc-800 — dropdown bg
          "--gmpx-color-surface-container-low": "#1c1c1f", // darker — dropdown row hover
          "--gmpx-color-surface-container-high": "#3f3f46",// zinc-700 — selected row
          "--gmpx-font-family-base": "var(--font-body, sans-serif)",
          "--gmpx-font-size-base": "1rem",
        } as React.CSSProperties
      }
    />
  );
}
