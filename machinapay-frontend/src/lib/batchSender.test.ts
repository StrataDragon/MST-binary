import { describe, it, expect, vi } from "vitest";
import { executeBatchTransfers, BatchItem } from "./batchSender";
import * as walletModule from "./wallet";

describe("lib/batchSender.ts Nonce Safety & Batch Execution Tests", () => {
  const recipient1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const recipient2 = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const recipient3 = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

  it("handles RPC errors on row 2 without skipping and executes row 3 with correct next nonce", async () => {
    // Starting pending nonce is 10
    let mockNonce = 10;
    const dispatchedNonces: number[] = [];

    const mockSigner: any = {
      getNonce: vi.fn().mockImplementation(async () => mockNonce),
    };

    // Spy on sendEth to observe nonces and simulate RPC failure on row 2
    const sendEthSpy = vi.spyOn(walletModule, "sendEth").mockImplementation(
      async (_signer, to, _amount, overrides) => {
        const nonceUsed = overrides?.nonce;
        dispatchedNonces.push(nonceUsed);

        // Row 1 (to === recipient1): succeeds
        if (to === recipient1) {
          return {
            hash: "0xhash-row-1",
            wait: vi.fn().mockResolvedValue({
              blockNumber: 101,
              gasUsed: 21000n,
              gasPrice: 2000000000n, // 2 Gwei
            }),
          } as any;
        }

        // Row 2 (to === recipient2): throws RPC error BEFORE broadcast
        if (to === recipient2) {
          throw new Error("RPC Error: internal json-rpc communication failure");
        }

        // Row 3 (to === recipient3): succeeds
        if (to === recipient3) {
          return {
            hash: "0xhash-row-3",
            wait: vi.fn().mockResolvedValue({
              blockNumber: 102,
              gasUsed: 21000n,
              gasPrice: 2000000000n,
            }),
          } as any;
        }

        throw new Error("Unexpected recipient");
      }
    );

    const items: BatchItem[] = [
      { id: "row-1", recipient: recipient1, amount: "0.01", status: "idle" },
      { id: "row-2", recipient: recipient2, amount: "0.02", status: "idle" },
      { id: "row-3", recipient: recipient3, amount: "0.03", status: "idle" },
    ];

    const logs: string[] = [];
    const state = await executeBatchTransfers(
      mockSigner,
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      items,
      { onLog: (msg) => logs.push(msg) }
    );

    // 1. Row statuses
    expect(items[0].status).toBe("confirmed");
    expect(items[0].txHash).toBe("0xhash-row-1");

    // Row 2 is marked failed, NOT silently skipped!
    expect(items[1].status).toBe("failed");
    expect(items[1].error).toContain("RPC Error");

    // Row 3 executed and confirmed!
    expect(items[2].status).toBe("confirmed");
    expect(items[2].txHash).toBe("0xhash-row-3");

    // 2. Nonce Safety Check:
    // Row 1 used nonce 10. Broadcast succeeded -> nonce advanced to 11.
    // Row 2 attempted with nonce 11. RPC failed -> nonce was NOT advanced!
    // Row 3 attempted with nonce 11! Broadcast succeeded -> nonce advanced to 12.
    // Resulting in exact continuous sequential nonces on-chain without holes or desync!
    expect(dispatchedNonces).toEqual([10, 11, 11]);

    // 3. Batch Summary Verification:
    expect(state.totalSentCount).toBe(2);
    expect(state.totalFailedCount).toBe(1);
    // Gas cost: row 1 (21000 * 2 Gwei) + row 3 (21000 * 2 Gwei) = 84000 Gwei
    expect(state.runningGasCostWei).toBe(84000000000000n);
  });

  it("supports mid-run cancellation and halts further execution", async () => {
    const mockSigner: any = {
      getNonce: vi.fn().mockResolvedValue(0),
    };

    let callCount = 0;
    vi.spyOn(walletModule, "sendEth").mockImplementation(async () => {
      callCount++;
      return {
        hash: "0xhash-cancel",
        wait: vi.fn().mockResolvedValue({
          blockNumber: 1,
          gasUsed: 21000n,
          gasPrice: 1000000000n,
        }),
      } as any;
    });

    let cancelRequested = false;

    const items: BatchItem[] = [
      { id: "c-1", recipient: recipient1, amount: "0.01", status: "idle" },
      { id: "c-2", recipient: recipient2, amount: "0.01", status: "idle" },
      { id: "c-3", recipient: recipient3, amount: "0.01", status: "idle" },
    ];

    // Trigger cancellation after first item finishes
    const state = await executeBatchTransfers(
      mockSigner,
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      items,
      {
        onRowUpdate: (idx) => {
          if (idx === 0) cancelRequested = true;
        },
      },
      () => cancelRequested
    );

    // Only row 1 was executed
    expect(callCount).toBe(1);
    expect(items[0].status).toBe("confirmed");
    expect(items[1].status).toBe("idle");
    expect(items[2].status).toBe("idle");
    expect(state.totalSentCount).toBe(1);
    expect(state.isCancelled).toBe(true);
  });
});
