"use client";

import { useEffect, useState } from "react";

export interface PageSection {
  id: string;
  label: string;
}

/** Sticky index of the page's sections; the section in view is marked. Shown from xl up. */
export function OnThisPage({ sections }: { sections: PageSection[] }) {
  const [current, setCurrent] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const nodes = sections.map((s) => document.getElementById(s.id)).filter((n): n is HTMLElement => n !== null);
    if (nodes.length === 0) return;
    // A section counts as current while it crosses a band near the top of the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="On this page" className="sticky top-8 text-sm">
      <p className="mb-3 font-medium">On this page</p>
      <ul className="space-y-0.5 border-l border-rule">
        {sections.map((s) => {
          const active = s.id === current;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={active ? "location" : undefined}
                className={`-ml-px block border-l-2 py-1 pl-3 transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  active ? "border-l-accent font-medium text-ink" : "border-l-transparent text-muted hover:text-ink"
                }`}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
