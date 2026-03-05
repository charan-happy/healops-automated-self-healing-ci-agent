import localFont from "next/font/local";

export const satoshi = localFont({
  src: "../../../public/fonts/Satoshi-Variable.woff2",
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  weight: "400 700",
});
