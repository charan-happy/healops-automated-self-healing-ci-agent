/**
 * Brand Design Tokens — Single Source of Truth
 *
 * ALL colors and typography in the app MUST come from this file
 * or from the CSS variables defined in globals.css that mirror these values.
 *
 * Brand font: Satoshi (400 Regular, 500 Medium, 600 Semi-bold, 700 Bold)
 *
 * Color strategy:
 * - Brand colors: visual identity (backgrounds, surfaces, primary CTA)
 * - Action colors: semantic meaning (success=green, danger=red, warning=amber, info=blue)
 *   Buttons and badges use action colors so the user instantly knows the intent.
 */

export const BRAND = {
  colors: {
    primary: "#4A90E2",
    primaryDark: "#003D7A",
    sky: "#C1D6EA",
    cyan: "#00BCD4",
    offWhite: "#F9FAFB",
    dark: "#1F2937",
    gray: "#6B7280",
    lightGray: "#D1D5DB",
  },

  action: {
    success: "#22C55E",
    danger: "#EF4444",
    warning: "#F59E0B",
    info: "#3B82F6",
    neutral: "#6B7280",
  },

  typography: {
    fontFamily: "'Satoshi', system-ui, sans-serif",
    h1: { size: "2.5rem", weight: 700, lineHeight: 1.2 },
    h2: { size: "1.875rem", weight: 700, lineHeight: 1.3 },
    h3: { size: "1.25rem", weight: 600, lineHeight: 1.4 },
    body: { size: "1rem", weight: 400, lineHeight: 1.6 },
    sm: { size: "0.875rem", weight: 400, lineHeight: 1.5 },
    xs: { size: "0.75rem", weight: 400, lineHeight: 1.5 },
  },

  button: {
    borderRadius: "8px",
    sizes: {
      lg: { px: "24px", py: "12px", fontSize: "16px" },
      md: { px: "20px", py: "8px", fontSize: "16px" },
      sm: { px: "16px", py: "6px", fontSize: "14px" },
    },
  },
} as const;

export type BrandColor = keyof typeof BRAND.colors;
export type ActionColor = keyof typeof BRAND.action;
