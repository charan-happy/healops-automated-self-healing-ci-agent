import { Zap } from "lucide-react";

const SIZES = {
  sm: { wrapper: "size-8", icon: "size-4", text: "text-lg" },
  md: { wrapper: "size-10", icon: "size-5", text: "text-xl" },
  lg: { wrapper: "size-12", icon: "size-6", text: "text-2xl" },
} as const;

interface HealOpsLogoProps {
  size?: keyof typeof SIZES;
  showText?: boolean;
}

export function HealOpsLogo({ size = "md", showText = true }: HealOpsLogoProps) {
  const s = SIZES[size];
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex ${s.wrapper} items-center justify-center rounded-2xl bg-gradient-to-br from-brand-cyan to-brand-primary shadow-lg shadow-brand-cyan/20`}
      >
        <Zap className={`${s.icon} text-white`} />
      </div>
      {showText && (
        <span className={`${s.text} font-black tracking-tight text-gradient`}>
          HealOps
        </span>
      )}
    </div>
  );
}
