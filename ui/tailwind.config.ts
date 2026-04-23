import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        primary: "var(--primary)",
        accent: "var(--accent)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        "piece-grain": "var(--piece-grain)",
        "piece-free": "var(--piece-free)",
        offcut: "var(--offcut)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: { sm: "4px", DEFAULT: "6px", lg: "10px" },
    },
  },
  plugins: [],
} satisfies Config;
