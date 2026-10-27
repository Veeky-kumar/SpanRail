"use client";

import { useState } from "react";

export function ChartCard({
  title,
  table,
  children,
}: {
  title: string;
  table: React.ReactNode;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <figure className="viz-root rounded-data border border-rule bg-surface p-4" style={{ margin: 0 }}>
      <div className="flex items-center justify-between">
        <figcaption className="text-sm font-medium" style={{ color: "var(--viz-text-primary)" }}>
          {title}
        </figcaption>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="pressable rounded-data border border-rule px-2.5 py-1 text-xs text-muted transition-colors duration-150 hover:bg-canvas hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {showTable ? "View chart" : "View as table"}
        </button>
      </div>
      <div key={showTable ? "table" : "chart"} className="reveal mt-3">
        {showTable ? table : children}
      </div>
    </figure>
  );
}
