import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { WalletMapView } from "./WalletMapView";

// Mock wallet module functions
vi.mock("../lib/wallet", () => {
  return {
    getReadProvider: vi.fn(),
    getRegistry: vi.fn(),
    getEscrow: vi.fn(),
    decodeContractError: vi.fn((e) => e?.message || "Contract error"),
  };
});

import { getReadProvider, getRegistry, getEscrow } from "../lib/wallet";

describe("WalletMapView Regression & Edge Case Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially with target network name", () => {
    const mockProvider: any = {
      getBalance: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
      getBlockNumber: vi.fn().mockReturnValue(new Promise(() => {})),
    };
    (getReadProvider as any).mockReturnValue(mockProvider);
    (getRegistry as any).mockReturnValue({
      getMachineIds: vi.fn().mockReturnValue(new Promise(() => {})),
      queryFilter: vi.fn().mockResolvedValue([]),
      filters: { MachineRegistered: vi.fn().mockReturnValue({}), MachineReputationUpdated: vi.fn().mockReturnValue({}) },
      on: vi.fn(),
      off: vi.fn(),
    });
    (getEscrow as any).mockReturnValue({
      queryFilter: vi.fn().mockResolvedValue([]),
      filters: {
        JobCreated: vi.fn().mockReturnValue({}),
        JobAccepted: vi.fn().mockReturnValue({}),
        ProofSubmitted: vi.fn().mockReturnValue({}),
        VerificationSubmitted: vi.fn().mockReturnValue({}),
        PaymentReleased: vi.fn().mockReturnValue({}),
        JobRefunded: vi.fn().mockReturnValue({}),
      },
      on: vi.fn(),
      off: vi.fn(),
    });

    render(
      <WalletMapView
        signer={null}
        clientAddress={null}
        clientBalance="0.0000"
        onRefreshBalances={vi.fn()}
      />
    );

    expect(screen.getByText(/Loading real on-chain topology/i)).toBeDefined();
  });

  it("renders topology even when wallet is not connected", async () => {
    const mockProvider: any = {
      getBalance: vi.fn().mockResolvedValue(0n),
      getBlockNumber: vi.fn().mockResolvedValue(100),
    };
    (getReadProvider as any).mockReturnValue(mockProvider);
    (getRegistry as any).mockReturnValue({
      getMachineIds: vi.fn().mockResolvedValue([]),
      queryFilter: vi.fn().mockResolvedValue([]),
      filters: { MachineRegistered: vi.fn().mockReturnValue({}), MachineReputationUpdated: vi.fn().mockReturnValue({}) },
      on: vi.fn(),
      off: vi.fn(),
    });
    (getEscrow as any).mockReturnValue({
      queryFilter: vi.fn().mockResolvedValue([]),
      filters: {
        JobCreated: vi.fn().mockReturnValue({}),
        JobAccepted: vi.fn().mockReturnValue({}),
        ProofSubmitted: vi.fn().mockReturnValue({}),
        VerificationSubmitted: vi.fn().mockReturnValue({}),
        PaymentReleased: vi.fn().mockReturnValue({}),
        JobRefunded: vi.fn().mockReturnValue({}),
      },
      on: vi.fn(),
      off: vi.fn(),
    });

    render(
      <WalletMapView
        signer={null}
        clientAddress={null}
        clientBalance="0.0000"
        onRefreshBalances={vi.fn()}
      />
    );

    // After loading completes, graph canvas is rendered with customer (not connected)
    await waitFor(() => {
      expect(screen.queryByText(/Loading real on-chain topology/i)).toBeNull();
    });

    expect(screen.getAllByText("Customer (Not Connected)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("JobEscrow").length).toBeGreaterThan(0);
  });

  it("displays error state with Retry button if RPC fails and nodes are empty", async () => {
    const mockProvider: any = {
      getBalance: vi.fn().mockRejectedValue(new Error("RPC Unreachable")),
      getBlockNumber: vi.fn().mockRejectedValue(new Error("RPC Unreachable")),
    };
    (getReadProvider as any).mockReturnValue(mockProvider);
    (getRegistry as any).mockImplementation(() => {
      throw new Error("Cannot reach registry");
    });
    (getEscrow as any).mockImplementation(() => {
      throw new Error("Cannot reach escrow");
    });

    render(
      <WalletMapView
        signer={null}
        clientAddress={null}
        clientBalance="0.0000"
        onRefreshBalances={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Can't reach/i)).toBeDefined();
      expect(screen.getAllByRole("button", { name: /Retry/i }).length).toBeGreaterThan(0);
    });
  });
});
