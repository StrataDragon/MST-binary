import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { WalletMapView } from "./WalletMapView";
import {
  buildDefaultTopology,
  computeFitTransform,
  clearDynamicActivity,
  normalizeAddress,
  MapNode,
  MapEdge,
} from "../lib/topology";

// Mock wallet module functions
vi.mock("../lib/wallet", () => {
  return {
    getReadProvider: vi.fn(),
    getRegistry: vi.fn(),
    getEscrow: vi.fn(),
    decodeContractError: vi.fn((e) => e?.message || "Contract error"),
  };
});

if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

import { getReadProvider, getRegistry, getEscrow } from "../lib/wallet";

describe("Topology Pure Engine Unit Tests", () => {
  it("normalizeAddress handles mixed case, whitespace, null and undefined", () => {
    expect(normalizeAddress("0xCB00D7FF471334F2EED249DF741C6E6C1B07AAF1")).toBe(
      "0xcb00d7ff471334f2eed249df741c6e6c1b07aaf1"
    );
    expect(normalizeAddress("  0xAbC123  ")).toBe("0xabc123");
    expect(normalizeAddress(null)).toBe("");
    expect(normalizeAddress(undefined)).toBe("");
  });

  it("buildDefaultTopology produces all 5 core domain entities with valid relationships", () => {
    const topology = buildDefaultTopology(
      null,
      "0.0000",
      [],
      {
        escrowAddress: "0x1111111111111111111111111111111111111111",
        registryAddress: "0x2222222222222222222222222222222222222222",
        verifierAddress: "0x3333333333333333333333333333333333333333",
        network: "MST Testnet",
        nativeToken: "MSTC",
      }
    );

    const nodeIds = topology.nodes.map((n) => n.id);
    expect(nodeIds).toContain("customer");
    expect(nodeIds).toContain("escrow");
    expect(nodeIds).toContain("verifier");
    expect(nodeIds).toContain("registry");
    expect(nodeIds).toContain("machine-M-042");

    // Verify node shapes and roles
    const customer = topology.nodes.find((n) => n.id === "customer")!;
    expect(customer.label).toBe("Customer");
    expect(customer.kind).toBe("customer");

    const escrow = topology.nodes.find((n) => n.id === "escrow")!;
    expect(escrow.label).toBe("Job Escrow");
    expect(escrow.kind).toBe("contract");

    const verifier = topology.nodes.find((n) => n.id === "verifier")!;
    expect(verifier.label).toBe("Protocol Verifier");
    expect(verifier.kind).toBe("verifier");

    const registry = topology.nodes.find((n) => n.id === "registry")!;
    expect(registry.label).toBe("Machine Registry");
    expect(registry.kind).toBe("contract");

    const machine = topology.nodes.find((n) => n.id === "machine-M-042")!;
    expect(machine.label).toBe("Machine M-042");
    expect(machine.kind).toBe("machine");

    // Verify flows
    const edgeActions = topology.edges.map((e) => e.action);
    expect(edgeActions).toContain("createJob");
    expect(edgeActions).toContain("submitAttestation");
    expect(edgeActions).toContain("recordJobResult");
    expect(edgeActions).toContain("submitProof");
    expect(edgeActions).toContain("release");
  });

  it("computeFitTransform produces a safe scale within [0.65, 2.25] and centered translation", () => {
    const mockNodes = [
      { x: 180, y: 280 },
      { x: 480, y: 280 },
      { x: 780, y: 280 },
      { x: 480, y: 110 },
      { x: 480, y: 450 },
    ];

    // Desktop viewport (1200 x 600)
    const fitDesktop = computeFitTransform(mockNodes, 1200, 600, 50);
    expect(fitDesktop.scale).toBeGreaterThanOrEqual(0.65);
    expect(fitDesktop.scale).toBeLessThanOrEqual(2.25);
    expect(typeof fitDesktop.translateX).toBe("number");
    expect(typeof fitDesktop.translateY).toBe("number");

    // Small mobile viewport (360 x 500)
    const fitMobile = computeFitTransform(mockNodes, 360, 500, 30);
    expect(fitMobile.scale).toBe(0.65); // clamped at lower bound
  });

  it("clearDynamicActivity retains core nodes and removes dynamic ones", () => {
    const mixedNodes: MapNode[] = [
      { id: "customer", label: "Customer", kind: "customer", address: "0x1", balance: "1", x: 100, y: 100 },
      { id: "escrow", label: "Job Escrow", kind: "contract", address: "0x2", balance: "0", x: 200, y: 100 },
      { id: "dynamic-mule-1", label: "Suspicious Node", kind: "customer", address: "0x9", balance: "0", x: 300, y: 100, isDynamic: true },
    ];

    const mixedEdges: MapEdge[] = [
      { id: "edge-1", from: "customer", to: "escrow", label: "createJob", action: "createJob" },
      { id: "edge-dyn", from: "customer", to: "dynamic-mule-1", label: "mule hop", action: "transfer", isDynamic: true },
    ];

    const cleaned = clearDynamicActivity(mixedNodes, mixedEdges);
    expect(cleaned.nodes.length).toBe(2);
    expect(cleaned.nodes.some((n) => n.id === "dynamic-mule-1")).toBe(false);
    expect(cleaned.edges.length).toBe(1);
    expect(cleaned.edges.some((e) => e.id === "edge-dyn")).toBe(false);
    expect(cleaned.selectedNodeId).toBe("customer");
  });
});

describe("WalletMapView Component Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially with target network name", () => {
    const mockProvider: any = {
      getBalance: vi.fn().mockReturnValue(new Promise(() => {})),
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

  it("renders topology without misleading disconnected labels on customer node", async () => {
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

    await waitFor(() => {
      expect(screen.queryByText(/Loading real on-chain topology/i)).toBeNull();
    });

    // Node labels are clean human-readable names
    expect(screen.getAllByText("Customer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Job Escrow").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Machine M-042").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Protocol Verifier").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Machine Registry").length).toBeGreaterThan(0);

    // Status banner shows deliberate disconnected topology message
    expect(screen.getByText(/Wallet disconnected - showing example topology/i)).toBeDefined();
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
