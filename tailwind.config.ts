import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      transitionTimingFunction: {
        "out-strong": "cubic-bezier(0.23, 1, 0.32, 1)",
      },
      colors: {
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        rule: "rgb(var(--rule) / <alpha-value>)",
        fault: "rgb(var(--fault) / <alpha-value>)",
        t1: "rgb(var(--t1) / <alpha-value>)",
        t2: "rgb(var(--t2) / <alpha-value>)",
        t3: "rgb(var(--t3) / <alpha-value>)",
        t4: "rgb(var(--t4) / <alpha-value>)",
        t5: "rgb(var(--t5) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
