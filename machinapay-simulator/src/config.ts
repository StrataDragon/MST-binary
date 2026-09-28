/**
 * All cross-laptop configuration lives here, sourced from environment
 * variables (see .env.example). Nothing about the backend's IP is ever
 * hardcoded in components — this is the ONLY file that reads import.meta.env.
 */

function readEnv(key: string, fallback: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv] as string | undefined;
  return value && value.length > 0 ? value : fallback;
}

export const config = {
  /** This machine's on-chain / protocol identity, assigned by Member 1's registry. */
  machineId: readEnv("VITE_MACHINE_ID", "M-042"),

  /**
   * WebSocket URL of the backend (Member 3's machine agent) that relays
   * jobs from Laptop 1 to this simulator on Laptop 2.
   * Example: ws://192.168.1.10:3000/ws
   */
  simulatorWsUrl: readEnv("VITE_SIMULATOR_WS_URL", "ws://localhost:4000/ws"),

  /** If true, runs entirely offline with a built-in fake backend for testing. Defaults to false. */
  mockMode: readEnv("VITE_MOCK_MODE", "false") === "true",

  /** Delay before auto-returning to IDLE after a completed/failed job. */
  autoResetDelayMs: Number(readEnv("VITE_AUTO_RESET_DELAY_MS", "6000")),

  /** Heartbeat interval sent while online. */
  heartbeatIntervalMs: Number(readEnv("VITE_HEARTBEAT_INTERVAL_MS", "5000")),
};

export type AppConfig = typeof config;
