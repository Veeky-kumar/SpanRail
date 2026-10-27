// Sections of a project and how a URL maps to one. Pure, so the matching rules are unit-tested.
export interface NavSection {
  key: "traces" | "analytics" | "prompts" | "datasets" | "settings";
  label: string;
  /** Path below /projects/:id ("" is the project root). */
  href: string;
}

export const SECTIONS: NavSection[] = [
  { key: "traces", label: "Traces", href: "" },
  { key: "analytics", label: "Analytics", href: "/analytics" },
  { key: "prompts", label: "Prompts", href: "/prompts" },
  { key: "datasets", label: "Datasets", href: "/datasets" },
  { key: "settings", label: "Settings", href: "/settings" },
];

/** The section a pathname belongs to, or null if it is outside this project. */
export function sectionFor(pathname: string, projectId: string): NavSection | null {
  const base = `/projects/${projectId}`;
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  const first = pathname.slice(base.length).split("/")[1] ?? "";
  if (first === "" || first === "traces") return SECTIONS[0];
  return SECTIONS.find((s) => s.href === `/${first}`) ?? null;
}
