"use client";

import { useEffect, useRef } from "react";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_STATIC_KEY ?? "";

// window-level singleton — survives across Next.js code-split chunks.
// Module-level vars are NOT shared between chunks; window IS.
declare global {
  interface Window {
    __roofingPlacesLib?: Promise<google.maps.PlacesLibrary>;
  }
}

function getPlacesLib(): Promise<google.maps.PlacesLibrary> {
  if (window.__roofingPlacesLib) return window.__roofingPlacesLib;
  // Assigned synchronously before first await — concurrent calls in same tick
  // get the same promise instead of bootstrapping the API twice.
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

  // Stable callback refs — always current when any event fires.
  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelect);
  onChangeRef.current = onChange;
  onSelectRef.current = onSelect;

  // Mount PlaceAutocompleteElement once.
  useEffect(() => {
    if (!MAPS_KEY || !containerRef.current) return;
    let cancelled = false;

    getPlacesLib().then(async (placesLib) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib = placesLib as any;
      if (cancelled || !containerRef.current || elementRef.current) return;
      if (!lib.PlaceAutocompleteElement) {
        console.error(
          "[PlacesAutocomplete] PlaceAutocompleteElement not available. " +
          "Ensure 'Maps JavaScript API' is enabled in Google Cloud Console for this key.",
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

      // Prefer listening on the outer pac element — native `input` events from
      // the inner shadow <input> are composed and bubble through the shadow
      // boundary, so no shadow-DOM reach-in is needed for keystroke forwarding.
      pac.addEventListener("input", (e: Event) => {
        onChangeRef.current((e.target as HTMLInputElement).value);
      });

      // Set placeholder and autoFocus via shadow-DOM input (no supported public
      // API for these on PlaceAutocompleteElement). Use MutationObserver so we
      // don't depend on a fixed number of animation frames for shadow render.
      const wireShadowInput = () => {
        const inner = pac.shadowRoot?.querySelector("input") as HTMLInputElement | null;
        if (inner) {
          inner.placeholder = placeholder;
          if (autoFocus) inner.focus();
        } else {
          console.error(
            "[PlacesAutocomplete] Shadow input not found — placeholder/autofocus unavailable. " +
            "Google may have changed PlaceAutocompleteElement internals.",
          );
        }
      };

      // Try immediately (shadow may already be rendered), then observe for it.
      if (pac.shadowRoot?.querySelector("input")) {
        wireShadowInput();
      } else {
        const mo = new MutationObserver(() => {
          if (pac.shadowRoot?.querySelector("input")) {
            mo.disconnect();
            wireShadowInput();
          }
        });
        mo.observe(pac, { childList: true, subtree: true });
        // Belt-and-suspenders: also try after one frame in case shadow root
        // renders synchronously but MutationObserver fires asynchronously.
        requestAnimationFrame(() => {
          if (!cancelled) wireShadowInput();
        });
      }

      // Fired when user selects a suggestion from the dropdown.
      pac.addEventListener("gmp-placeautocomplete-placechange", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const place = pac.value as any;
        if (!place) return;
        try {
          await place.fetchFields({ fields: ["location", "formattedAddress"] });
          const lat: number = place.location.lat();
          const lng: number = place.location.lng();
          const formattedAddress: string = place.formattedAddress ?? "";
          onChangeRef.current(formattedAddress);
          onSelectRef.current({ lat, lng, formattedAddress });
        } catch (err) {
          console.error("[PlacesAutocomplete] fetchFields error:", err);
        }
      });
    });

    return () => {
      cancelled = true;
      if (elementRef.current) {
        elementRef.current.remove();
        elementRef.current = null;
      }
    };
  // Stable effect — deps that don't change after mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value resets (e.g. parent clears the field after selection).
  useEffect(() => {
    if (!elementRef.current) return;
    const inner = elementRef.current.shadowRoot?.querySelector("input") as HTMLInputElement | null;
    if (inner && inner.value !== value) inner.value = value;
  }, [value]);

  // Callers pass className that previously styled a plain <input>.
  // Now it styles the outer container div — border, bg, rounded, sizing.
  // Inner text color / font are driven by --gmpx-* CSS custom properties below,
  // which IS Google's documented styling surface for PlaceAutocompleteElement.
  const defaultClass =
    "flex-1 h-10 rounded-lg border border-border bg-surface-2 text-sm text-text-primary " +
    "hover:border-border-strong focus-within:border-accent focus-within:ring-1 focus-within:ring-accent " +
    "transition-colors overflow-hidden";

  if (!MAPS_KEY) {
    return (
      <input
        type="text"
        disabled
        placeholder="Maps API key not configured"
        className={className ?? defaultClass}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={className ?? defaultClass}
      style={
        {
          // Google's documented styling surface for PlaceAutocompleteElement.
          // transparent surface/outline means the outer container div is the visual box.
          "--gmpx-color-surface": "transparent",
          "--gmpx-color-on-surface": "var(--text-primary, #f4f4f5)",
          "--gmpx-color-on-surface-variant": "var(--text-muted, #71717a)",
          "--gmpx-color-outline": "transparent",
          "--gmpx-color-primary": "var(--accent, #818cf8)",
          "--gmpx-font-family-base": "var(--font-body, sans-serif)",
          "--gmpx-font-size-base": "0.875rem",
          "--gmpx-color-surface-container-low": "transparent",
          // Dropdown background — use surface-2 so it matches the app dark theme.
          "--gmpx-color-surface-container": "var(--surface-2, #27272a)",
        } as React.CSSProperties
      }
    />
  );
}
