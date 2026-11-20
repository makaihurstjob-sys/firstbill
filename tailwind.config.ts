import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "var(--page)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        panel: "var(--panel)",
        line: "var(--line)",
        brand: { DEFAULT: "var(--brand)", ink: "var(--brand-ink)", soft: "var(--brand-soft)" },
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)" },
        danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)" },
        ok: { DEFAULT: "var(--ok)", soft: "var(--ok-soft)" },
        ph: {
          bg: "var(--ph-bg)",
          ink: "var(--ph-ink)",
          sub: "var(--ph-sub)",
          bar: "var(--ph-bar)",
          sep: "var(--ph-sep)",
          card: "var(--ph-card)",
          field: "var(--ph-field)",
          in: "var(--bub-in)",
          "in-ink": "var(--bub-in-ink)",
          out: "var(--bub-out)",
          "out-ink": "var(--bub-out-ink)",
        },
        bezel: "var(--bezel)",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        ios: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "Inter", "system-ui", "sans-serif"],
      },
      keyframes: {
        "bubble-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "banner-in": { from: { opacity: "0", transform: "translateY(-120%)" }, to: { opacity: "1", transform: "none" } },
        dot: { "0%, 60%, 100%": { opacity: "0.35", transform: "translateY(0)" }, "30%": { opacity: "1", transform: "translateY(-2px)" } },
      },
      animation: {
        "bubble-in": "bubble-in 220ms ease-out both",
        "banner-in": "banner-in 380ms cubic-bezier(.2,.9,.3,1.1) both",
        dot: "dot 1.2s infinite ease-in-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
