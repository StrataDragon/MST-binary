import { describe, it, expect, vi, beforeEach } from "vitest";
import * as walletModule from "./wallet";
import {
  sendEth,
  depositToEscrow,
  releasePayment,
  estimateTransferGas,
  WalletError,
} from "./wallet";
import { parseEther, ZeroAddress } from "ethers";

describe("lib/wallet.ts Unit Tests", () => {
  const validAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  describe("sendEth", () => {
    it("rejects invalid recipient address format before calling signer", async () => {
      const mockSigner: any = {
        sendTransaction: vi.fn(),
      };

      await expect(sendEth(mockSigner, "invalid-0x123", "1.0")).rejects.toThrow(WalletError);

      try {
        await sendEth(mockSigner, "0x123", "1.0");
      } catch (err: any) {
        expect(err).toBeInstanceOf(WalletError);
        expect(err.code).toBe("INVALID_ADDRESS");
      }

      // Ensure signer was never called
      expect(mockSigner.sendTransaction).not.toHaveBeenCalled();
    });

    it("wraps ACTION_REJECTED / user rejection into WalletError('ACTION_REJECTED')", async () => {
      const mockSigner: any = {
        sendTransaction: vi.fn().mockRejectedValue({
          code: "ACTION_REJECTED",
          message: "user rejected action",
        }),
      };

      try {
        await sendEth(mockSigner, validAddress, "0.5");
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(WalletError);
        expect(err.code).toBe("ACTION_REJECTED");
      }
    });

    it("wraps INSUFFICIENT_FUNDS into WalletError('INSUFFICIENT_FUNDS')", async () => {
      const mockSigner: any = {
        sendTransaction: vi.fn().mockRejectedValue({
          code: "INSUFFICIENT_FUNDS",
          message: "insufficient funds for gas * price + value",
        }),
      };

      try {
        await sendEth(mockSigner, validAddress, "1000.0");
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(WalletError);
        expect(err.code).toBe("INSUFFICIENT_FUNDS");
      }
    });

    it("wraps revert messages into WalletError('TRANSACTION_REVERTED')", async () => {
      const mockSigner: any = {
        sendTransaction: vi.fn().mockRejectedValue({
          data: "0x08c379a0",
          message: "execution reverted: TransferFailed()",
        }),
      };

      try {
        await sendEth(mockSigner, validAddress, "0.1");
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(WalletError);
        expect(err.code).toBe("TRANSACTION_REVERTED");
      }
    });

    it("successfully sends transaction with manual overrides", async () => {
      const mockTx = { hash: "0xabc123", wait: vi.fn().mockResolvedValue({ blockNumber: 42 }) };
      const mockSigner: any = {
        sendTransaction: vi.fn().mockResolvedValue(mockTx),
      };

      const tx = await sendEth(mockSigner, validAddress, "0.25", { nonce: 5 });
      expect(tx).toBe(mockTx);
      expect(mockSigner.sendTransaction).toHaveBeenCalledWith({
        to: validAddress,
        value: parseEther("0.25"),
        nonce: 5,
      });
    });
  });

  describe("depositToEscrow & releasePayment", () => {
    it("calls createJob with correct arguments and native value", async () => {
      const mockTx = {
        hash: "0x111",
        wait: vi.fn().mockResolvedValue({ blockNumber: 1 }),
      };
      const mockSigner: any = {
        getAddress: vi.fn().mockResolvedValue("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
        sendTransaction: vi.fn().mockResolvedValue(mockTx),
        provider: {
          resolveName: vi.fn().mockImplementation((name) => name),
        },
      };

      const jobId = "0x" + "1".repeat(64);
      const metadataHash = "0x" + "2".repeat(64);

      const result = await depositToEscrow(
        mockSigner,
        jobId,
        metadataHash,
        3600,
        "Move package",
        "2.5"
      );

      expect(result.hash).toBe("0x111");
      expect(mockSigner.sendTransaction).toHaveBeenCalled();
    });

    it("calls release with correct jobId", async () => {
      const mockTx = {
        hash: "0x222",
        wait: vi.fn().mockResolvedValue({ blockNumber: 1 }),
      };
      const mockSigner: any = {
        getAddress: vi.fn().mockResolvedValue("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
        sendTransaction: vi.fn().mockResolvedValue(mockTx),
        provider: {
          resolveName: vi.fn().mockImplementation((name) => name),
        },
      };

      const jobId = "0x" + "3".repeat(64);
      const result = await releasePayment(mockSigner, jobId);

      expect(result.hash).toBe("0x222");
      expect(mockSigner.sendTransaction).toHaveBeenCalled();
    });
  });

  describe("estimateTransferGas", () => {
    it("returns sane gas limits and estimated cost", async () => {
      const mockProvider = {
        estimateGas: vi.fn().mockResolvedValue(21000n),
        getFeeData: vi.fn().mockResolvedValue({
          maxFeePerGas: 2000000000n, // 2 Gwei
          gasPrice: 2000000000n,
        }),
      };

      const estimation = await estimateTransferGas(
        mockProvider,
        validAddress,
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        "1.0"
      );

      expect(estimation.gasLimit).toBe(21000n);
      expect(estimation.maxFeePerGas).toBe(2000000000n);
      // 21000 * 2 Gwei = 42,000 Gwei = 0.000042 ETH
      expect(parseFloat(estimation.estimatedCostEth)).toBeCloseTo(0.000042, 6);
    });
  });
});
