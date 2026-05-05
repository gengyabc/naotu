export const TELEMETRY_ENABLED = false;

export function assertNoTelemetry(): void {
  // This plugin does not send analytics, telemetry, or user content to remote servers.
}
