import type { MetadataRoute } from "next";

import { env } from "env";

/**
 * @description Sitemap for the website
 * @returns {MetadataRoute.Sitemap} Sitemap for the website
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = env.NEXT_PUBLIC_APP_URL;

  return [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
