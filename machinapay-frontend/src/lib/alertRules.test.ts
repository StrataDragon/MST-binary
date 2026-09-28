import { describe, it, expect, beforeEach } from "vitest";
import { alertManager, AlertType } from "./alertRules";
import { settingsStore } from "./settings";
import { addressBook } from "./addressBook";

describe("lib/alertRules.ts Table-Driven Boundary Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    alertManager.clearAll();
    settingsStore.set({
      lowBalanceWarningEth: 0.5,
      largeTransferThresholdEth: 1.0,
      gasSpikeThresholdGwei: 40.0,
    });
  });

  const testCases: {
    rule: AlertType;
    description: string;
    trigger: (shouldFire: boolean) => void;
  }[] = [
    {
      rule: "LOW_BALANCE",
      description: "Fires when balance is strictly below 0.5 ETH, does NOT fire at exact boundary 0.5 ETH",
      trigger: (shouldFire) => {
        // At 0.5 ETH -> should not fire. At 0.499 ETH -> should fire.
        const balance = shouldFire ? "0.499" : "0.500";
        alertManager.evaluateBalance(balance);
      },
    },
    {
      rule: "TX_FAILED",
      description: "Fires when transaction status is 'failed', does NOT fire when 'confirmed'",
      trigger: (shouldFire) => {
        alertManager.evaluateTxEvent({
          id: "tx-test-1",
          from: "0x123",
          to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          amount: "0.1 ETH",
          type: "transfer",
          status: shouldFire ? "failed" : "confirmed",
          timestamp: "Just now",
        });
      },
    },
    {
      rule: "LARGE_TRANSFER",
      description: "Fires at exact threshold >= 1.0 ETH, does NOT fire just below at 0.999 ETH",
      trigger: (shouldFire) => {
        const amount = shouldFire ? "1.000" : "0.999";
        alertManager.evaluateTxEvent({
          id: "tx-test-2",
          from: "0x123",
          to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          amount: `${amount} ETH`,
          type: "transfer",
          status: "confirmed",
          timestamp: "Just now",
        });
      },
    },
    {
      rule: "UNKNOWN_ADDRESS_INTERACTION",
      description: "Fires when interacting with an unrecorded address, does NOT fire for known labeled address",
      trigger: (shouldFire) => {
        const knownAddr = "0x8888888888888888888888888888888888888888";
        addressBook.set({
          address: knownAddr,
          label: "Recognized Vault",
          tag: "contract",
        });

        const target = shouldFire
          ? "0x7777777777777777777777777777777777777777" // unknown
          : knownAddr; // known

        alertManager.evaluateTxEvent({
          id: "tx-test-3",
          from: "0x123",
          to: target,
          amount: "0.05 ETH",
          type: "transfer",
          status: "confirmed",
          timestamp: "Just now",
        });
      },
    },
    {
      rule: "GAS_SPIKE",
      description: "Fires at exact boundary >= 40.0 Gwei, does NOT fire at 39.9 Gwei",
      trigger: (shouldFire) => {
        const gasPriceGwei = shouldFire ? 40.0 : 39.9;
        alertManager.evaluateGasPrice(gasPriceGwei);
      },
    },
  ];

  testCases.forEach(({ rule, description, trigger }) => {
    it(`Rule ${rule}: ${description}`, () => {
      // 1. Run just under threshold (should not fire)
      alertManager.clearAll();
      trigger(false);
      const alertsSub = alertManager.getAll().filter((a) => a.type === rule);
      expect(alertsSub.length).toBe(0);

      // 2. Run at or past boundary condition (must fire)
      alertManager.clearAll();
      trigger(true);
      const alertsFired = alertManager.getAll().filter((a) => a.type === rule);
      expect(alertsFired.length).toBe(1);
      expect(alertsFired[0].type).toBe(rule);
    });
  });
});
