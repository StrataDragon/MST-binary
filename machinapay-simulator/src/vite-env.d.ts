/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MACHINE_ID: string;
  readonly VITE_SIMULATOR_WS_URL: string;
  readonly VITE_MOCK_MODE: string;
  readonly VITE_AUTO_RESET_DELAY_MS: string;
  readonly VITE_HEARTBEAT_INTERVAL_MS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
