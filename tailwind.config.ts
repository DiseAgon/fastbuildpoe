import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-raised": "var(--color-surface-raised)",
        border: "var(--color-border)",
        text: "var(--color-text)",
        muted: "var(--color-text-muted)",
        accent: "var(--color-accent)",
        "accent-soft": "var(--color-accent-soft)",
        rarity: {
          normal: "var(--rarity-normal)",
          magic: "var(--rarity-magic)",
          rare: "var(--rarity-rare)",
          unique: "var(--rarity-unique)",
          gem: "var(--rarity-gem)",
        },
      },
      fontFamily: {
        serif: "var(--font-serif)",
        sans: "var(--font-sans)",
      },
      boxShadow: {
        card: "0 1px 0 0 var(--color-border) inset, 0 12px 32px -16px rgb(0 0 0 / 0.8)",
      },
    },
  },
  plugins: [],
};

export default config;
