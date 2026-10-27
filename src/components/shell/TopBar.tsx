"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionFor } from "@/lib/nav";
import { MenuIcon } from "./icons";
import { ShellNav, type ShellProject } from "./ShellNav";

/**
 * Slim top bar: breadcrumb, plus the menu button that opens the navigation sheet on narrow
 * screens. The sheet is a native <dialog>, so focus is trapped and Escape closes it for free.
 */
export function TopBar({
  project,
  projects,
  email,
}: {
  project: ShellProject;
  projects: ShellProject[];
  email: string;
}) {
  const pathname = usePathname();
  const section = sectionFor(pathname, project.id);
  const sheet = useRef<HTMLDialogElement>(null);

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-rule bg-canvas/80 px-4 backdrop-blur-md sm:px-6">
      <button
        type="button"
        onClick={() => sheet.current?.showModal()}
        aria-label="Open navigation"
        className="btn-secondary -ml-1 px-2 py-1.5 lg:hidden"
      >
        <MenuIcon />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
        <ol className="flex items-center gap-1.5 text-muted">
          <li className="hidden sm:block">
            <Link href="/" className="hover:text-ink">
              Projects
            </Link>
          </li>
          <li aria-hidden className="hidden sm:block">
            /
          </li>
          <li className="min-w-0 truncate">
            <Link href={`/projects/${project.id}`} className="hover:text-ink">
              {project.name}
            </Link>
          </li>
          {section && (
            <>
              <li aria-hidden>/</li>
              <li aria-current="page" className="font-medium text-ink">
                {section.label}
              </li>
            </>
          )}
        </ol>
      </nav>

      <dialog
        ref={sheet}
        aria-label="Navigation"
        onClick={(e) => {
          if (e.target === sheet.current) sheet.current?.close();
        }}
        className="glass fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-72 max-w-[85vw] rounded-l-none p-0 text-ink backdrop:bg-ink/30"
      >
        <ShellNav project={project} projects={projects} email={email} onNavigate={() => sheet.current?.close()} />
      </dialog>
    </header>
  );
}
