export function ProjectProgressRing({ value }: { value: number }) {
  const progress = Math.max(
    0,
    Math.min(100, Number.isFinite(value) ? value : 0),
  );
  return (
    <div
      className="relative size-14 shrink-0"
      role="img"
      aria-label={`Project progress: ${progress}%`}
    >
      <svg
        viewBox="0 0 48 48"
        className="size-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="var(--muted)"
          strokeWidth="4"
        />
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke={progress === 100 ? "var(--chart-2)" : "var(--chart-1)"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${progress * 1.256637} 125.6637`}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums"
        aria-hidden="true"
      >
        {Math.round(progress)}%
      </span>
    </div>
  );
}
