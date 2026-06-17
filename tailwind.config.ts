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
        "accent-2": "var(--color-accent-2)",
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
        card: "0 1px 2px 0 rgb(0 0 0 / 0.05), 0 10px 28px -16px rgb(0 0 0 / 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
