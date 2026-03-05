/**
 * Client-side analytics helper.
 * Wraps PostHog capture calls for type-safe event tracking.
 * Safe to call even if PostHog is not loaded (SSR or ad-blocked).
 */

import posthog from "posthog-js";
import { POSTHOG_EVENTS } from "../constants/events";

type EventName = (typeof POSTHOG_EVENTS)[keyof typeof POSTHOG_EVENTS];

let _initialized = false;

/** Initialize PostHog on the client. Call once in Providers. */
export function initAnalytics() {
  if (_initialized || typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage",
  });
  _initialized = true;
}

/** Track an event with optional properties. */
export function trackEvent(
  event: EventName,
  properties?: Record<string, unknown>,
) {
  try {
    if (typeof window !== "undefined" && posthog.capture) {
      posthog.capture(event, properties);
    }
  } catch {
    // Silently ignore — analytics should never crash the app
  }
}

/** Identify a user after login/signup. */
export function identifyUser(
  userId: string,
  traits?: Record<string, unknown>,
) {
  try {
    if (typeof window !== "undefined" && posthog.identify) {
      posthog.identify(userId, traits);
    }
  } catch {
    // Silently ignore
  }
}

/** Reset identity on logout. */
export function resetAnalytics() {
  try {
    if (typeof window !== "undefined" && posthog.reset) {
      posthog.reset();
    }
  } catch {
    // Silently ignore
  }
}

export { POSTHOG_EVENTS };
