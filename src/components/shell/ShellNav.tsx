"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS, sectionFor } from "@/lib/nav";
import { logoutAction } from "@/app/actions";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { SectionIcon } from "./icons";

export interface ShellProject {
  id: string;
  name: string;
}

/** The sidebar contents. Used as the fixed sidebar on wide screens and inside the sheet on narrow ones. */
export function ShellNav({
  project,
  projects,
  email,
  onNavigate,
}: {
  project: ShellProject;
  projects: ShellProject[];
  email: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = sectionFor(pathname, project.id);

  return (
    <div className="flex h-full flex-col gap-5 p-4">
      <Link href="/" onClick={onNavigate} aria-label="Spanrail, all projects" className="px-1 py-1">
        <Logo />
      </Link>

      <ProjectSwitcher current={project} projects={projects} onNavigate={onNavigate} />

      <nav aria-label="Project" className="flex flex-col gap-0.5">
        {SECTIONS.map((s) => {
          const isActive = active?.key === s.key;
          return (
            <Link
              key={s.key}
              href={`/projects/${project.id}${s.href}`}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={`flex h-9 items-center gap-2.5 rounded-data border-l-2 px-3 text-sm transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                isActive
                  ? "border-l-accent bg-canvas font-medium text-ink"
                  : "border-l-transparent text-muted hover:bg-canvas hover:text-ink"
              }`}
            >
              <SectionIcon name={s.key} />
              {s.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-border pt-4">
        <ThemeToggle />
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted" title={email}>
            {email}
          </span>
          <form action={logoutAction}>
            <button type="submit" className="pressable shrink-0 rounded-data px-1.5 py-1 text-xs text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
