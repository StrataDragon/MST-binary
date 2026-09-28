import { NATIVE_SYMBOL } from "./config";

export interface UserSettings {
  primaryCurrency: string;
  gasPreference: "slow" | "standard" | "fast";
  confirmationThreshold: number;
  displayDensity: "comfortable" | "compact";
  largeTransferThresholdEth: number;
  lowBalanceWarningEth: number;
  gasSpikeThresholdGwei: number;
}

const SETTINGS_KEY = "machinapay_user_settings_v1";

const DEFAULT_SETTINGS: UserSettings = {
  primaryCurrency: NATIVE_SYMBOL,
  gasPreference: "standard",
  confirmationThreshold: 1,
  displayDensity: "comfortable",
  largeTransferThresholdEth: 1.0,
  lowBalanceWarningEth: 0.5,
  gasSpikeThresholdGwei: 40.0,
};

type SettingsListener = (settings: UserSettings) => void;
const listeners: SettingsListener[] = [];

export const settingsStore = {
  get(): UserSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  set(partial: Partial<UserSettings>): void {
    const current = this.get();
    const updated = { ...current, ...partial };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    listeners.forEach((l) => l(updated));
  },

  subscribe(listener: SettingsListener) {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },

  getGasMultiplier(pref?: "slow" | "standard" | "fast"): number {
    const p = pref || this.get().gasPreference;
    if (p === "slow") return 0.85;
    if (p === "fast") return 1.35;
    return 1.0;
  },
};
