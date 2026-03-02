import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/libs/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand-primary/15 text-brand-primary",
        secondary: "border-transparent bg-brand-sky/20 text-brand-primary-dark dark:text-brand-sky",
        destructive: "border-transparent bg-action-danger/15 text-action-danger",
        outline: "text-foreground border-border",
        success: "border-transparent bg-action-success/15 text-action-success",
        warning: "border-transparent bg-action-warning/15 text-action-warning",
        info: "border-transparent bg-action-info/15 text-action-info",
        neutral: "border-transparent bg-action-neutral/15 text-action-neutral",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
