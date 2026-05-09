import * as Sentry from "@sentry/node";

let initialized = false;

export const initSentry = (): void => {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // Not a hard error: in dev / CI we run without Sentry. The launch BLOCKER
    // covers the case where prod is missing the DSN.
    console.warn("[sentry] SENTRY_DSN not set; skipping init");
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: 0.1,
  });
  initialized = true;
};

export const captureException = (err: unknown): void => {
  if (initialized) Sentry.captureException(err);
};
