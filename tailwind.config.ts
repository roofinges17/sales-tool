import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#CC2A2E",
          dark: "#a82126",
          light: "#d93a3f",
        },
        surface: {
          0: "#0a0a0a",
          1: "#111111",
          2: "#1a1a1a",
          3: "#262626",
        },
        border: {
          DEFAULT: "#27272a",
          subtle: "#1f1f23",
          strong: "#3f3f46",
        },
        text: {
          primary: "#f5f5f5",
          secondary: "#a1a1aa",
          tertiary: "#71717a",
          muted: "#52525b",
        },
        accent: {
          DEFAULT: "#0072E5",
          light: "#3b9cf5",
          subtle: "rgba(0,114,229,0.12)",
          hover: "#005cc4",
        },
        status: {
          green: "#22c55e",
          teal: "#14b8a6",
          orange: "#f97316",
          red: "#ef4444",
          purple: "#a855f7",
        },
      },
      fontSize: {
        "heading-lg": ["1.25rem", { lineHeight: "1.75rem", fontWeight: "700" }],
        "heading-md": ["1.125rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        "heading-sm": ["0.9375rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.25rem" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.25rem" }],
        caption: ["0.75rem", { lineHeight: "1rem" }],
      },
      backgroundImage: {
        "gradient-accent": "linear-gradient(135deg, #0072E5 0%, #005cc4 100%)",
      },
      boxShadow: {
        "glow-sm": "0 0 12px rgba(0,114,229,0.3)",
        glow: "0 0 20px rgba(0,114,229,0.5)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
