"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronsIcon } from "./icons";

interface ProjectRef {
  id: string;
  name: string;
}

/** Shows the current project and opens a soft, translucent list to jump to another one. */
export function ProjectSwitcher({
  current,
  projects,
  onNavigate,
}: {
  current: ProjectRef;
  projects: ProjectRef[];
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    onNavigate?.();
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-data border border-rule bg-surface px-3 py-2 text-left text-sm transition-colors duration-100 hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="min-w-0">
          <span className="block text-xs text-muted">Project</span>
          <span className="block truncate font-medium">{current.name}</span>
        </span>
        <span className="text-muted">
          <ChevronsIcon />
        </span>
      </button>

      {open && (
        <div role="listbox" aria-label="Projects" className="glass reveal absolute inset-x-0 top-full z-30 mt-1 p-1">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              role="option"
              aria-selected={p.id === current.id}
              onClick={close}
              className={`block truncate rounded-data px-3 py-2 text-sm transition-colors duration-100 hover:bg-canvas ${
                p.id === current.id ? "font-medium" : "text-muted hover:text-ink"
              }`}
            >
              {p.name}
            </Link>
          ))}
          <div className="my-1 border-t border-rule" />
          <Link href="/" onClick={close} className="block rounded-data px-3 py-2 text-sm text-muted transition-colors duration-100 hover:bg-canvas hover:text-ink">
            All projects
          </Link>
        </div>
      )}
    </div>
  );
}
