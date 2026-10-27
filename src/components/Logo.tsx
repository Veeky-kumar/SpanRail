// The Spanrail mark is a time ruler: five phases of a call laid end to end (the same ramp the
// time budget uses), with tick marks underneath. It is the product's one recurring visual idea.
const SEGMENTS = [
  { x: 0, w: 3, fill: "rgb(var(--t1))" },
  { x: 3.5, w: 2, fill: "rgb(var(--t2))" },
  { x: 6, w: 4, fill: "rgb(var(--t3))" },
  { x: 10.5, w: 9, fill: "rgb(var(--t4))" },
  { x: 20, w: 4, fill: "rgb(var(--t5))" },
];
const TICKS = [0, 7.5, 15.5, 23];

export function LogoMark({ className = "h-4 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 16" aria-hidden className={className} fill="none">
      {SEGMENTS.map((s) => (
        <rect key={s.x} x={s.x} y={2} width={s.w} height={8} style={{ fill: s.fill }} />
      ))}
      {TICKS.map((x) => (
        <rect key={x} x={x} y={12} width={1} height={4} fill="currentColor" />
      ))}
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-[17px] font-semibold leading-none tracking-[-0.02em]">Spanrail</span>
    </span>
  );
}
