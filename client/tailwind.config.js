/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#06070a",
        surface: "#0f1115",
        "surface-light": "#15181e",
        border: "#1d222b",
        "border-light": "#282f3c",
        accent: "#6366f1",
        "accent-dim": "#4f46e5",
        "accent-glow": "#818cf8",
        muted: "#94a3b8",
        success: "#10b981",
        danger: "#ef4444",
        warn: "#f59e0b",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Outfit", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
