/**
 * MachinaPay - Pure Topology & Graph Layout Engine
 * ------------------------------------------------
 * Deterministic, layered positioning and viewport transformation
 * for the MachinaPay Escrow & Settlement topology.
 */

export type NodeKind = "customer" | "machine" | "contract" | "verifier";

export interface MapNode {
  id: string;
  label: string;
  subLabel?: string;
  kind: NodeKind;
  address: string;
  balance: string;
  x: number;
  y: number;
  isDynamic?: boolean;
  details?: Record<string, string | number | boolean>;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  action: string;
  curveOffset?: number; // perpendicular curvature offset in px (positive = curve right/down, negative = curve left/up)
  amount?: string;
  txHash?: string;
  isPending?: boolean;
  isError?: boolean;
  isDynamic?: boolean;
}

export interface ViewportTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface MachineInfoInput {
  idStr: string;
  wallet: string;
  signer?: string;
  owner?: string;
  active: boolean;
  reputation?: number;
  stake?: string;
  balance?: string;
}

/**
 * Normalizes an Ethereum / MST address to lowercase for deduplication and matching.
 */
export function normalizeAddress(address: string | null | undefined): string {
  if (!address) return "";
  return address.trim().toLowerCase();
}

/**
 * Builds the canonical 5-entity baseline topology:
 * 1. Customer (EOA / Actor)
 * 2. JobEscrow (Smart Contract)
 * 3. Machine M-042 (Registered Machine Agent / Actor)
 * 4. Protocol Verifier (Service / Actor)
 * 5. MachineRegistry (Identity & Collateral Contract)
 */
export function buildDefaultTopology(
  clientAddress: string | null,
  clientBalance: string,
  machines: MachineInfoInput[],
  contractConfig: { escrowAddress: string; registryAddress: string; verifierAddress: string; network: string; nativeToken: string }
): { nodes: MapNode[]; edges: MapEdge[] } {
  const normClient = normalizeAddress(clientAddress);

  // 1. Customer Node
  const customerNode: MapNode = {
    id: "customer",
    label: "Customer",
    subLabel: clientAddress ? `${clientAddress.slice(0, 6)}...${clientAddress.slice(-4)}` : "Demo Wallet",
    kind: "customer",
    address: clientAddress || "0x0000000000000000000000000000000000000000",
    balance: clientBalance || "0.0000",
    x: 180,
    y: 280,
    details: {
      "Account Type": "External Owned Account (EOA)",
      "Connection Status": clientAddress ? "Connected" : "Disconnected (Demo Mode)",
      "Address": clientAddress || "Not connected",
      "Balance": `${clientBalance || "0.0000"} ${contractConfig.nativeToken}`,
      "Network": contractConfig.network,
    },
  };

  // 2. JobEscrow Node (Smart Contract)
  const escrowNode: MapNode = {
    id: "escrow",
    label: "Job Escrow",
    subLabel: "Core Escrow Contract",
    kind: "contract",
    address: contractConfig.escrowAddress,
    balance: "0.0000",
    x: 480,
    y: 280,
    details: {
      "Contract Name": "JobEscrow.sol",
      "Role": "Autonomous Commerce Vault",
      "Address": contractConfig.escrowAddress,
      "Authorized Verifier": contractConfig.verifierAddress,
      "Settlement Mode": "EIP-712 Dual Attestation",
    },
  };

  // 3. Protocol Verifier Node (Service)
  const verifierNode: MapNode = {
    id: "verifier",
    label: "Protocol Verifier",
    subLabel: "Independent Attestation",
    kind: "verifier",
    address: contractConfig.verifierAddress,
    balance: "0.0000",
    x: 480,
    y: 110,
    details: {
      "Service Name": "MachinaPay Verifier Engine",
      "Role": "Evidence & Tolerance Validator",
      "Address": contractConfig.verifierAddress,
      "Schema": "EIP-712 MachinaPayAttestation",
    },
  };

  // 4. MachineRegistry Node (Smart Contract)
  const registryNode: MapNode = {
    id: "registry",
    label: "Machine Registry",
    subLabel: "Identity & Collateral",
    kind: "contract",
    address: contractConfig.registryAddress,
    balance: "0.0000",
    x: 480,
    y: 450,
    details: {
      "Contract Name": "MachineRegistry.sol",
      "Role": "Machine Identity, Collateral & Reputation",
      "Address": contractConfig.registryAddress,
    },
  };

  // 5. Machine Nodes
  const machineNodes: MapNode[] = [];
  const effectiveMachines: MachineInfoInput[] =
    machines.length > 0
      ? machines
      : [
          {
            idStr: "M-042",
            wallet: "0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1",
            active: true,
            reputation: 100,
            stake: "0.01",
            balance: "10.0000",
          },
        ];

  effectiveMachines.forEach((m, idx) => {
    let yPos = 280;
    if (effectiveMachines.length === 2) {
      yPos = idx === 0 ? 195 : 365;
    } else if (effectiveMachines.length > 2) {
      const step = 260 / (effectiveMachines.length - 1);
      yPos = 150 + idx * step;
    }

    machineNodes.push({
      id: `machine-${m.idStr}`,
      label: `Machine ${m.idStr}`,
      subLabel: m.active ? "Active Operator" : "Inactive",
      kind: "machine",
      address: m.wallet,
      balance: m.balance || "0.0000",
      x: 780,
      y: yPos,
      details: {
        "Machine ID": m.idStr,
        "Role": "Autonomous Physical Agent",
        "Operator Wallet": m.wallet,
        "Signer Key": m.signer || m.wallet,
        "Status": m.active ? "Active & Registered" : "Inactive",
        "Reputation Score": m.reputation ?? 100,
        "Staked Collateral": `${m.stake || "0.01"} ${contractConfig.nativeToken}`,
      },
    });
  });

  const allNodes = [customerNode, escrowNode, verifierNode, registryNode, ...machineNodes];

  // 6. Base Protocol Edges
  // Follows exact domain flow:
  // - Customer -- createJob + value --> JobEscrow
  // - Verifier -- submitAttestation --> JobEscrow
  // - JobEscrow -- recordJobResult / rep --> MachineRegistry
  // - Machine -- accept / submitProof --> JobEscrow (curved up)
  // - JobEscrow -- release payment --> Machine (curved down)
  const edges: MapEdge[] = [
    {
      id: "edge-customer-escrow",
      from: "customer",
      to: "escrow",
      label: "createJob + value",
      action: "createJob",
      curveOffset: 0,
    },
    {
      id: "edge-verifier-escrow",
      from: "verifier",
      to: "escrow",
      label: "submitAttestation",
      action: "submitAttestation",
      curveOffset: 0,
    },
    {
      id: "edge-escrow-registry",
      from: "escrow",
      to: "registry",
      label: "recordJobResult / rep",
      action: "recordJobResult",
      curveOffset: 0,
    },
  ];

  // Connect each machine to escrow with separate non-overlapping directional curved paths
  machineNodes.forEach((mNode) => {
    edges.push({
      id: `edge-${mNode.id}-escrow`,
      from: mNode.id,
      to: "escrow",
      label: "accept / submitProof",
      action: "submitProof",
      curveOffset: -45, // Arcs cleanly upward
    });

    edges.push({
      id: `edge-escrow-${mNode.id}`,
      from: "escrow",
      to: mNode.id,
      label: "release payment",
      action: "release",
      curveOffset: 45, // Arcs cleanly downward
    });
  });

  return { nodes: allNodes, edges };
}

/**
 * Calculates a constrained scale and centering translation to fit the graph
 * nicely into the container without clipped labels or excessive dead space.
 */
export function computeFitTransform(
  nodes: { x: number; y: number }[],
  containerWidth: number,
  containerHeight: number,
  padding = 75
): ViewportTransform {
  if (!nodes || nodes.length === 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const nodeRadiusX = 85;
  const nodeRadiusY = 75;

  for (const n of nodes) {
    minX = Math.min(minX, n.x - nodeRadiusX);
    maxX = Math.max(maxX, n.x + nodeRadiusX);
    minY = Math.min(minY, n.y - nodeRadiusY);
    maxY = Math.max(maxY, n.y + nodeRadiusY + 30);
  }

  const graphWidth = Math.max(80, maxX - minX);
  const graphHeight = Math.max(80, maxY - minY);

  const availWidth = Math.max(80, containerWidth - padding * 2);
  const availHeight = Math.max(80, containerHeight - padding * 2);

  const rawScale = Math.min(availWidth / graphWidth, availHeight / graphHeight);
  // Constrain zoom strictly within [0.65, 2.25]
  const scale = Math.min(2.25, Math.max(0.65, rawScale));

  const graphCenterX = (minX + maxX) / 2;
  const graphCenterY = (minY + maxY) / 2;

  const translateX = Math.round(containerWidth / 2 - graphCenterX * scale);
  const translateY = Math.round(containerHeight / 2 - graphCenterY * scale);

  return { scale, translateX, translateY };
}

/**
 * Computes an SVG curved or straight path and its label midpoint.
 * Stops cleanly at the source and target node boundaries.
 */
export function computeEdgeGeometry(
  fromNode: MapNode,
  toNode: MapNode,
  curveOffset = 0
): {
  pathD: string;
  midX: number;
  midY: number;
} {
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;

  // Approximate boundary offset based on node kind (contracts are wider rects)
  const fromOffset = fromNode.kind === "contract" ? 38 : 32;
  const toOffset = toNode.kind === "contract" ? 38 : 32;

  const startX = fromNode.x + (dx / dist) * fromOffset;
  const startY = fromNode.y + (dy / dist) * fromOffset;
  const endX = toNode.x - (dx / dist) * toOffset;
  const endY = toNode.y - (dy / dist) * toOffset;

  if (Math.abs(curveOffset) < 1) {
    // Straight line
    return {
      pathD: `M ${startX.toFixed(1)} ${startY.toFixed(1)} L ${endX.toFixed(1)} ${endY.toFixed(1)}`,
      midX: Math.round((startX + endX) / 2),
      midY: Math.round((startY + endY) / 2),
    };
  }

  // Normal vector perpendicular to the line
  const nx = -dy / dist;
  const ny = dx / dist;

  const chordMidX = (startX + endX) / 2;
  const chordMidY = (startY + endY) / 2;

  // Control point for Quadratic Bezier
  const cpX = chordMidX + nx * curveOffset;
  const cpY = chordMidY + ny * curveOffset;

  // Quadratic Bezier midpoint at t = 0.5: B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2
  const midX = Math.round(0.25 * startX + 0.5 * cpX + 0.25 * endX);
  const midY = Math.round(0.25 * startY + 0.5 * cpY + 0.25 * endY);

  const pathD = `M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${cpX.toFixed(1)} ${cpY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`;

  return { pathD, midX, midY };
}

/**
 * Clears dynamic simulated/live activity while safely preserving core topology.
 */
export function clearDynamicActivity(
  nodes: MapNode[],
  edges: MapEdge[]
): {
  nodes: MapNode[];
  edges: MapEdge[];
  selectedNodeId: string;
} {
  const retainedNodes = nodes.filter((n) => !n.isDynamic);
  const retainedEdges = edges.filter((e) => !e.isDynamic);

  return {
    nodes: retainedNodes,
    edges: retainedEdges,
    selectedNodeId: "customer",
  };
}
