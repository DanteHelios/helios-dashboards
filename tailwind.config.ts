import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "fg-1": "var(--fg-1)",
        "fg-2": "var(--fg-2)",
        "fg-3": "var(--fg-3)",
        "fg-muted": "var(--fg-muted)",
        "bg-page": "var(--bg-page)",
        "bg-alt": "var(--bg-alt)",
        "bg-dark": "var(--bg-dark)",
        border: "var(--border)",
        "border-soft": "var(--border-soft)",
        "helios-orange": "var(--helios-orange)",
        "helios-green": "var(--helios-green)",
        "helios-green-tint": "var(--helios-green-tint)",
      },
      fontFamily: {
        heading: ["Pragmatica Extended", "Helvetica Neue", "Arial", "sans-serif"],
        body: ["Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      boxShadow: {
        "cta-glow": "0 0 40px -10px var(--helios-orange)",
        "card-hover": "var(--shadow-card-hover)",
      },
      borderRadius: {
        pill: "9999px",
        "card-md": "1rem",
        "card-lg": "2rem",
      },
      transitionTimingFunction: {
        helios: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
