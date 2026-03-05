"use client";

import { GoogleTagManager } from "@next/third-parties/google";
import { env } from "env";

export default function GoogleAnalyticsScripts() {
  return (
    <GoogleTagManager
      gtmId={env.NEXT_PUBLIC_GTM_KEY!}
      gtmScriptUrl={`${env.NEXT_PUBLIC_APP_URL}/gm`}
    />
  );
}
