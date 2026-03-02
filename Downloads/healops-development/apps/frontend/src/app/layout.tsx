import "./globals.css";

import { Suspense } from "react";
import { satoshi } from "@/app/_config/fonts";
import { metadata } from "@/app/_config/metadata";
import { viewport } from "@/app/_config/viewport";
import AppBreadcrumb from "./_components/AppBreadcrumb";

export { metadata, viewport };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${satoshi.variable} font-sans antialiased`}>
        <div className="flex flex-col h-screen bg-background bg-grid-pattern bg-ambient-glow overflow-hidden">
          <Suspense fallback={<div className="h-14" />}>
            <AppBreadcrumb />
          </Suspense>
          <div className="relative z-10 flex-1 overflow-auto">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
