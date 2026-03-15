/**
 * Lightweight analytics and error tracking for beta feedback.
 * Logs to server when EXPO_PUBLIC_API_URL is set.
 */

const SERVER_URL = process.env.EXPO_PUBLIC_API_URL || "";
const ENABLED = !!SERVER_URL && !__DEV__;

export type ErrorContext = {
  screen?: string;
  action?: string;
  area?: string;
  extra?: Record<string, string | number>;
};

export function trackError(error: unknown, context?: ErrorContext): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  if (__DEV__) {
    console.warn("[Analytics] Error:", message, context);
  }

  if (!ENABLED) return;

  fetch(`${SERVER_URL}/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "error",
      message,
      stack: stack?.slice(0, 500),
      ...context,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {
    // Silently fail - don't break the app
  });
}

export function trackEvent(name: string, props?: Record<string, string | number>): void {
  if (__DEV__) {
    console.log("[Analytics] Event:", name, props);
  }

  if (!ENABLED) return;

  fetch(`${SERVER_URL}/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "event",
      name,
      ...props,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});
}
