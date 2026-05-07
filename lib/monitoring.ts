export function captureException(
  err: unknown,
  tags?: Record<string, string>
): void {
  const message = err instanceof Error ? err.message : String(err);
  // Always log so Vercel's log drain picks it up
  console.error("[cron error]", message, tags ?? {});

  // Sentry integration: if SENTRY_DSN is set and @sentry/nextjs is installed,
  // wire Sentry.captureException here with scope.setTag for each entry in tags.
  // Skipped until Sentry is explicitly configured for this project.
}
