import "./globals.css";

import { satoshi } from "@/app/_config/fonts";
import { metadata } from "@/app/_config/metadata";
import { viewport } from "@/app/_config/viewport";
import { OrgProvider } from "@/app/_libs/context/OrgContext";

export { metadata, viewport };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${satoshi.variable} font-sans antialiased`}>
        <OrgProvider>
          <div className="flex h-screen bg-background bg-grid-pattern bg-ambient-glow overflow-hidden">
            {children}
          </div>
        </OrgProvider>
      </body>
    </html>
  );
}
