/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#F5F6F8",
        card: "#FFFFFF",
        border: "#E5E7EB",
        primary: "#111827",
        secondary: "#6B7280",
        muted: "#9CA3AF",
        "accent-red": "#EF4444",
        "accent-green": "#22C55E",
        "accent-blue": "#3B82F6",
        "accent-amber": "#F59E0B",
        sidebar: {
          bg: "#0B0B0E",
          text: "#E5E7EB",
          active: "rgba(255, 255, 255, 0.08)",
        },
        // Semantic aliases
        ink: "#0B0B0E",
        panel: "#FFFFFF",
        line: "#E5E7EB",
        signal: "#F59E0B",
        ok: "#22C55E",
        bad: "#EF4444",
        dim: "#6B7280",
      },
      fontFamily: {
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["'Inter'", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
