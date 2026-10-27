"use client";

import { useState } from "react";
import { resolveTheme, themeCookie, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** Segmented Light / Dark / System control. Applies instantly and remembers the choice in a cookie. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>(() =>
    typeof document === "undefined" ? "light" : resolveTheme(document.documentElement.dataset.theme),
  );

  function choose(next: ThemeChoice) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = themeCookie(next);
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-data border border-rule bg-canvas p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          onClick={() => choose(o.value)}
          className={`rounded-[2px] px-2.5 py-1 text-xs transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
            theme === o.value ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
