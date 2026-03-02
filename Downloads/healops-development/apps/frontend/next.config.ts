import type { NextConfig } from "next";

import path from "path";

import withBundleAnalyzer from "@next/bundle-analyzer";

import { env } from "env";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  productionBrowserSourceMaps: false,
  skipTrailingSlashRedirect: true,

  /**
   * IMPORTANT: Fix for Nx monorepo workspace root detection
   */
  outputFileTracingRoot: path.join(__dirname, "../../"),

  /**
   * Fix ESLint plugin conflict in Nx monorepo
   */
  eslint: {
    dirs: ["src"],
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  /**
   * Suppress OpenTelemetry / Sentry dynamic require warnings
   */
  webpack: (config) => {
    config.ignoreWarnings = [
      { module: /@opentelemetry/ },
      { module: /require-in-the-middle/ },
    ];
    return config;
  },

  /**
   * Required for PostHog and Sentry in Next.js 15+
   */
  serverExternalPackages: [
    "import-in-the-middle",
    "require-in-the-middle",
  ],

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },

  async rewrites() {
    return [];
  },

  experimental: {
    authInterrupts: true,
    inlineCss: false,

    optimizePackageImports: [
      "date-fns",
      "react-hook-form",
      "lodash-es",
    ],

    webVitalsAttribution: [
      "FCP",
      "LCP",
      "CLS",
    ],
  },
};


export default withBundleAnalyzer({
  enabled: env.ANALYZE === "true",
})(nextConfig);
