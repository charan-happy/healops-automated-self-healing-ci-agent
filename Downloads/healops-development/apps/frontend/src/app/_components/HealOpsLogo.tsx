import { Zap } from "lucide-react";

interface HealOpsLogoProps {
  size?: number | "sm" | "md" | "lg";
  className?: string;
  showText?: boolean;
}

export function HealOpsLogo({ size = 40, className = "", showText = false }: HealOpsLogoProps) {
  const px = typeof size === "number" ? size : size === "sm" ? 32 : size === "lg" ? 48 : 40;
  const iconPx = Math.round(px * 0.5);

  return (
    <div
      className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-cyan to-brand-primary ${className}`}
      style={{ width: px, height: px }}
    >
      <Zap className="text-white" style={{ width: iconPx, height: iconPx }} />
    </div>
  );
}

export function HealOpsLogoWithText({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const px = size === "sm" ? 32 : size === "lg" ? 48 : 40;
  return (
    <div className="flex items-center gap-3">
      <HealOpsLogo size={px} className="shadow-lg shadow-brand-cyan/20" />
      <span className={`${size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-xl"} font-black tracking-tight text-gradient`}>
        HealOps
      </span>
    </div>
  );
}
