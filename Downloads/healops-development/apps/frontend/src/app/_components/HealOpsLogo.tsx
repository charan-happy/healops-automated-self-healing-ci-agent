"use client";

/**
 * HealOps Logo — Circular cycle arrow with a checkmark inside.
 * Represents autonomous CI/CD pipeline repair: cycle = pipeline loop, check = fix verified.
 *
 * Usage:
 *   <HealOpsLogo size={40} />              — gradient background (default)
 *   <HealOpsLogo size={40} variant="mono" /> — stroke only, no background
 */

interface HealOpsLogoProps {
  size?: number;
  className?: string;
  variant?: "default" | "mono";
}

export function HealOpsLogo({ size = 40, className = "", variant = "default" }: HealOpsLogoProps) {
  const id = `healops-grad-${size}`;

  if (variant === "mono") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="HealOps logo"
      >
        {/* Circular cycle arrow */}
        <path
          d="M 33 14 A 13 13 0 1 1 15 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <polygon points="19,8 13,15 20,17" fill="currentColor" />
        {/* Checkmark */}
        <polyline
          points="17,25 22,30 32,18"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="HealOps logo"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00BCD4" />
          <stop offset="100%" stopColor="#1E88E5" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="12" fill={`url(#${id})`} />
      {/* Circular cycle arrow — CI/CD pipeline loop */}
      <path
        d="M 33 14 A 13 13 0 1 1 15 14"
        fill="none"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <polygon points="19,8 13,15 20,17" fill="white" />
      {/* Checkmark — fix verified */}
      <polyline
        points="17,25 22,30 32,18"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
