// What's new, shown on the home page. Every entry is something that was actually merged: the dates and
// wording come from the project's git history, newest first. Add an entry when a change ships; do not
// add one for work that has not landed.
export interface ChangelogEntry {
  /** ISO date (YYYY-MM-DD) the change was merged. */
  date: string;
  title: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  { date: "2026-10-27", title: "A landing page that walks through one call, step by step" },
  { date: "2026-10-27", title: "A new look: light by default, a sidebar, and a ruler for a logo" },
  { date: "2026-10-27", title: "Traces: a generation's time budget now comes first" },
  { date: "2026-10-20", title: "Go gateway: DNS, connect, TLS and first-byte timing for every call" },
  { date: "2026-10-14", title: "Create API keys from the dashboard" },
  { date: "2026-10-14", title: "A single-process mode for small deployments" },
];

export const recentChanges = (count: number): ChangelogEntry[] => CHANGELOG.slice(0, Math.max(0, count));
