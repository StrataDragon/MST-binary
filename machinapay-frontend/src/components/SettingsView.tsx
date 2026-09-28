import React, { useState, useEffect } from "react";
import { Settings, Save, Check, RefreshCw } from "lucide-react";
import { settingsStore, UserSettings } from "../lib/settings";
import { cfg } from "../lib/config";

export function SettingsView() {
  const [settings, setSettings] = useState<UserSettings>(settingsStore.get());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    return settingsStore.subscribe(setSettings);
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    settingsStore.set(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-5 max-w-3xl space-y-6 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h2 className="text-base font-bold text-primary tracking-tight flex items-center gap-2">
            <Settings className="w-4 h-4 text-accent-blue" />
            <span>Preferences & Network Settings</span>
          </h2>
          <p className="text-xs text-secondary font-sans">
            Customize gas priority presets, confirmation thresholds, and display units.
          </p>
        </div>

        {saved && (
          <span className="pill-confirmed text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            <span>Settings Saved!</span>
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* 1. Primary Display Currency */}
        <div className="p-4 rounded-lg bg-page border border-border space-y-2">
          <label className="text-xs font-bold text-primary block">Primary Currency Display</label>
          <p className="text-[11px] text-secondary font-sans leading-relaxed">
            Choose whether cryptocurrency figures across statistics, tables, and transfer forms display primary values in ETH or USD.
          </p>
          <div className="flex gap-3 pt-1">
            {(["ETH", "USD"] as const).map((curr) => (
              <label
                key={curr}
                className={`flex items-center gap-2 px-3 py-1.5 rounded border cursor-pointer ${
                  settings.primaryCurrency === curr
                    ? "bg-card border-accent-blue text-accent-blue font-bold shadow-xs"
                    : "border-border text-secondary hover:text-primary"
                }`}
              >
                <input
                  type="radio"
                  name="currency"
                  checked={settings.primaryCurrency === curr}
                  onChange={() => setSettings({ ...settings, primaryCurrency: curr })}
                  className="hidden"
                />
                <span>{curr} Equivalent</span>
              </label>
            ))}
          </div>
        </div>

        {/* 2. Gas Preference Preset */}
        <div className="p-4 rounded-lg bg-page border border-border space-y-2">
          <label className="text-xs font-bold text-primary block">Gas Speed & Priority Preset</label>
          <p className="text-[11px] text-secondary font-sans leading-relaxed">
            Multipliers applied to baseFee and priorityFee for transfer and escrow contract transactions.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              { id: "slow", label: "Slow (0.85x)", desc: "Lowest gas cost" },
              { id: "standard", label: "Standard (1.0x)", desc: "Normal block inclusion" },
              { id: "fast", label: "Fast (1.35x)", desc: "Next block priority" },
            ].map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setSettings({ ...settings, gasPreference: p.id as any })}
                className={`p-2.5 rounded border text-left transition-all ${
                  settings.gasPreference === p.id
                    ? "bg-card border-accent-blue text-primary font-bold shadow-xs"
                    : "border-border text-secondary hover:text-primary"
                }`}
              >
                <div className="font-bold text-xs">{p.label}</div>
                <div className="text-[10px] text-muted font-sans">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Confirmation Threshold */}
        <div className="p-4 rounded-lg bg-page border border-border space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-primary block">Block Confirmation Threshold</label>
            <span className="font-bold text-accent-blue">{settings.confirmationThreshold} Blocks</span>
          </div>
          <p className="text-[11px] text-secondary font-sans leading-relaxed">
            Number of block receipts required before transactions are marked as "Confirmed" vs "Confirming".
          </p>
          <input
            type="range"
            min="1"
            max="12"
            value={settings.confirmationThreshold}
            onChange={(e) => setSettings({ ...settings, confirmationThreshold: parseInt(e.target.value) })}
            className="w-full h-1.5 bg-border rounded appearance-none cursor-pointer accent-accent-blue"
          />
        </div>

        {/* 4. Display Density */}
        <div className="p-4 rounded-lg bg-page border border-border space-y-2">
          <label className="text-xs font-bold text-primary block">Table Display Density</label>
          <div className="flex gap-3 pt-1">
            {[
              { id: "comfortable", label: "Comfortable (Standard Padding)" },
              { id: "compact", label: "Compact (Dense View)" },
            ].map((d) => (
              <label
                key={d.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded border cursor-pointer ${
                  settings.displayDensity === d.id
                    ? "bg-card border-accent-blue text-accent-blue font-bold shadow-xs"
                    : "border-border text-secondary hover:text-primary"
                }`}
              >
                <input
                  type="radio"
                  name="density"
                  checked={settings.displayDensity === d.id}
                  onChange={() => setSettings({ ...settings, displayDensity: d.id as any })}
                  className="hidden"
                />
                <span>{d.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 5. Large Transfer Alert Threshold */}
        <div className="p-4 rounded-lg bg-page border border-border space-y-2">
          <label className="text-xs font-bold text-primary block">Large Transfer Alert Threshold (ETH)</label>
          <input
            type="number"
            step="0.1"
            value={settings.largeTransferThresholdEth}
            onChange={(e) => setSettings({ ...settings, largeTransferThresholdEth: parseFloat(e.target.value) || 1.0 })}
            className="w-48 bg-card border border-border rounded p-2 text-primary font-mono text-xs focus:outline-none focus:border-accent-blue"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-3 border-t border-border">
          <button
            type="submit"
            className="flex items-center gap-2 px-4 py-2 rounded bg-accent-blue hover:bg-blue-600 text-white font-bold text-xs shadow-xs transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Preferences</span>
          </button>
        </div>
      </form>
    </div>
  );
}
