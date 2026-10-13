"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Traces", href: "" },
  { label: "Analytics", href: "/analytics" },
  { label: "Prompts", href: "/prompts" },
  { label: "Datasets", href: "/datasets" },
  { label: "Settings", href: "/settings" },
];

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav className="mt-4 flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const href = base + tab.href;
        const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab.href}
            href={href}
            className={`pressable -mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-150 ${
              active ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
