import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/libs/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer active:scale-[0.97]",
  {
    variants: {
      variant: {
        // Semantic: color = meaning
        success:
          "bg-action-success text-white shadow-sm hover:bg-action-success/90 hover:shadow-md hover:shadow-action-success/20 focus-visible:ring-action-success/50",
        danger:
          "bg-action-danger text-white shadow-sm hover:bg-action-danger/90 hover:shadow-md hover:shadow-action-danger/20 focus-visible:ring-action-danger/50",
        warning:
          "bg-action-warning text-brand-dark shadow-sm hover:bg-action-warning/90 hover:shadow-md hover:shadow-action-warning/20 focus-visible:ring-action-warning/50",
        info:
          "bg-action-info text-white shadow-sm hover:bg-action-info/90 hover:shadow-md hover:shadow-action-info/20 focus-visible:ring-action-info/50",

        // Soft semantic: subtle background with colored text
        "success-soft":
          "bg-action-success/10 text-action-success border border-action-success/20 hover:bg-action-success/20 hover:border-action-success/40 focus-visible:ring-action-success/50",
        "danger-soft":
          "bg-action-danger/10 text-action-danger border border-action-danger/20 hover:bg-action-danger/20 hover:border-action-danger/40 focus-visible:ring-action-danger/50",
        "warning-soft":
          "bg-action-warning/10 text-action-warning border border-action-warning/20 hover:bg-action-warning/20 hover:border-action-warning/40 focus-visible:ring-action-warning/50",
        "info-soft":
          "bg-action-info/10 text-action-info border border-action-info/20 hover:bg-action-info/20 hover:border-action-info/40 focus-visible:ring-action-info/50",

        // Brand variants
        primary:
          "bg-gradient-to-r from-brand-primary to-brand-cyan text-white shadow-md hover:shadow-lg hover:shadow-brand-cyan/25 hover:brightness-110 focus-visible:ring-brand-primary/50",
        secondary:
          "bg-brand-sky/15 text-brand-sky border border-brand-sky/30 backdrop-blur-sm hover:bg-brand-sky/25 hover:border-brand-sky/50 focus-visible:ring-brand-sky/50",
        tertiary:
          "bg-transparent text-brand-sky hover:text-white hover:bg-white/5 focus-visible:ring-brand-sky/50",
        dark:
          "bg-brand-primary-dark text-white border border-brand-primary-dark/50 shadow-md hover:shadow-lg hover:bg-brand-primary-dark/90 focus-visible:ring-brand-primary-dark/50",

        // Utility variants
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/50",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/50",
        outline:
          "border border-border/60 bg-white/5 backdrop-blur-sm text-foreground hover:bg-white/10 hover:border-border focus-visible:ring-ring/50",
        ghost:
          "hover:bg-white/5 hover:text-foreground focus-visible:ring-ring/50",
        link:
          "text-brand-cyan underline-offset-4 hover:underline focus-visible:ring-brand-cyan/50",
      },
      size: {
        lg: "h-12 px-6 py-3 text-base rounded-xl",
        md: "h-10 px-5 py-2 text-sm rounded-xl",
        sm: "h-8 px-4 py-1.5 text-xs rounded-lg",
        default: "h-10 px-4 py-2 text-sm rounded-xl",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
