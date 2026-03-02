import type { Metadata } from "next";

import { env } from "env";

/**
 * @description Metadata for the website
 * @returns {Metadata} Metadata for the website
 */
export const metadata: Metadata = {
  title: {
    template: `%s - ${env.NEXT_PUBLIC_APP_TITLE}`,
    default: env.NEXT_PUBLIC_APP_TITLE,
  },
  description: env.NEXT_PUBLIC_APP_DESCRIPTION,
  keywords: env.NEXT_PUBLIC_APP_KEYWORDS,
  alternates: {
    canonical: env.NEXT_PUBLIC_APP_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: env.NEXT_PUBLIC_APP_TITLE,
    description: env.NEXT_PUBLIC_APP_DESCRIPTION,
  },
  openGraph: {
    siteName: env.NEXT_PUBLIC_APP_TITLE,
    url: env.NEXT_PUBLIC_APP_URL,
    type: "website",
  },
  icons: [
    {
      rel: "shortcut icon",
      type: "image/x-icon",
      sizes: "48x48",
      url: "/favicons/favicon.ico",
    },
    {
      rel: "icon",
      type: "image/png",
      sizes: "16x16",
      url: "/favicons/favicon-16x16.png",
    },
    {
      rel: "icon",
      type: "image/png",
      sizes: "32x32",
      url: "/favicons/favicon-32x32.png",
    },
    {
      rel: "icon",
      type: "image/png",
      sizes: "96x96",
      url: "/favicons/favicon-96x96.png",
    },
    {
      rel: "apple-touch-icon",
      sizes: "180x180",
      url: "/favicons/apple-touch-icon.png",
    },
  ],
};
