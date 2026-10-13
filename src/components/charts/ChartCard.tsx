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
    <figure className="viz-root rounded-xl border border-border bg-surface p-4" style={{ margin: 0 }}>
      <div className="flex items-center justify-between">
        <figcaption className="text-sm font-medium" style={{ color: "var(--viz-text-primary)" }}>
          {title}
        </figcaption>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="pressable rounded border border-border px-2 py-0.5 text-xs text-muted transition-colors duration-150 hover:bg-canvas"
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
