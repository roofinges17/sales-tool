import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#f97316",
          dark: "#ea6c05",
          light: "#fb923c",
        },
        surface: {
          1: "#111111",
          2: "#1a1a1a",
          3: "#262626",
        },
      },
    },
  },
  plugins: [],
};
export default config;
