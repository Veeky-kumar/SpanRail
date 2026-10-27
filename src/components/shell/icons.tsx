// Small inline 16px icons (no icon dependency). Decorative: always aria-hidden, the label is text.
import type { NavSection } from "@/lib/nav";

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export function SectionIcon({ name }: { name: NavSection["key"] }) {
  switch (name) {
    case "traces":
      return (
        <Svg>
          <path d="M2 4h6M5 8h8M3 12h5" />
        </Svg>
      );
    case "analytics":
      return (
        <Svg>
          <path d="M3 13V8M8 13V3M13 13V6" />
        </Svg>
      );
    case "prompts":
      return (
        <Svg>
          <path d="M3 4h10M3 8h10M3 12h6" />
        </Svg>
      );
    case "datasets":
      return (
        <Svg>
          <path d="M2 4.5 8 2l6 2.5L8 7 2 4.5ZM2 8l6 2.5L14 8M2 11.5 8 14l6-2.5" />
        </Svg>
      );
    case "settings":
      return (
        <Svg>
          <path d="M3 5h3M11 5h2M3 11h2M9 11h4" />
          <circle cx="8.5" cy="5" r="1.5" />
          <circle cx="7" cy="11" r="1.5" />
        </Svg>
      );
  }
}

export function MenuIcon() {
  return (
    <Svg>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </Svg>
  );
}

export function ChevronsIcon() {
  return (
    <Svg>
      <path d="m5 6.5 3-3 3 3M5 9.5l3 3 3-3" />
    </Svg>
  );
}
