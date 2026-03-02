"use client";

export function PoweredByGeekyAnts({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60 ${className}`}>
      <span>Built with</span>
      <span className="text-red-400">&hearts;</span>
      <span>by</span>
      <a
        href="https://geekyants.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-semibold text-muted-foreground/80 transition-colors hover:text-foreground"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0"
        >
          <rect width="32" height="32" rx="6" fill="#DC2626" />
          <text
            x="16"
            y="22"
            textAnchor="middle"
            fill="white"
            fontSize="16"
            fontWeight="bold"
            fontFamily="system-ui"
          >
            G
          </text>
        </svg>
        GeekyAnts
      </a>
    </div>
  );
}

export function GeekyAntsBadge() {
  return (
    <a
      href="https://geekyants.com"
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-[10px] font-medium text-muted-foreground/70 transition-all hover:border-red-500/30 hover:bg-red-500/5 hover:text-muted-foreground"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
      >
        <rect width="32" height="32" rx="6" fill="#DC2626" />
        <text
          x="16"
          y="22"
          textAnchor="middle"
          fill="white"
          fontSize="16"
          fontWeight="bold"
          fontFamily="system-ui"
        >
          G
        </text>
      </svg>
      A GeekyAnts Product
    </a>
  );
}
