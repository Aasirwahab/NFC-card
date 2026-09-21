/**
 * The alerts worth waking up for (spec §24.2), as one structured log line each.
 *
 * `level: "alert"` is the thing to filter on in a log drain. Sentry is not wired
 * yet (SENTRY_DSN is optional in the env schema); when it is, this is the one
 * place that forwards to it, so no call site changes.
 */
export function alert(event: string, details: Record<string, unknown>): void {
  console.error(
    JSON.stringify({ level: 'alert', event, at: new Date().toISOString(), ...details }),
  );
}
