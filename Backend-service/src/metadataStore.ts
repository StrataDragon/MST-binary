import * as fs from "fs";
import * as path from "path";
import { keccak256, toUtf8Bytes } from "ethers";
import { canonicalJson } from "./signing";

export interface Position {
  x: number;
  y: number;
}

export type TaskType =
  | "MOVE_OBJECT"
  | "PICK_AND_PLACE"
  | "LOAD_AND_DUMP"
  | "DELIVERY"
  | "PACKAGE_TRANSPORT"
  | "COLOR_SORTING";

export interface JobMetadataInput {
  taskType?: TaskType;
  source?: Position;
  target?: Position;
  simulateFailure?: boolean;
  description?: string;
  machineId?: string;
  pickupLocation?: string;
  destination?: string;
  distanceKm?: number;
  packageWeightKg?: number;
  objectCount?: number;
  colors?: string[];
  requiredAccuracyPercent?: number;
  pricing?: any;
}

export interface JobMetadata {
  taskType: TaskType;
  source: Position;
  target: Position;
  simulateFailure?: boolean;
  description?: string;
  machineId?: string;
  pickupLocation?: string;
  destination?: string;
  distanceKm?: number;
  packageWeightKg?: number;
  objectCount?: number;
  colors?: string[];
  requiredAccuracyPercent?: number;
  pricing?: any;
}

const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_FILE = path.join(DATA_DIR, "metadata_store.json");

// In-memory cache keyed by canonical metadataHash (0x...)
const metadataByHash = new Map<string, JobMetadata>();

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadPersisted() {
  try {
    ensureDir();
    if (fs.existsSync(STORE_FILE)) {
      const content = fs.readFileSync(STORE_FILE, "utf8");
      const records = JSON.parse(content) as Record<string, JobMetadata>;
      for (const [hash, meta] of Object.entries(records)) {
        metadataByHash.set(hash.toLowerCase(), meta);
      }
    }
  } catch (err) {
    console.warn("[metadataStore] Could not load persisted metadata:", err);
  }
}

function persistStore() {
  try {
    ensureDir();
    const records: Record<string, JobMetadata> = {};
    for (const [hash, meta] of metadataByHash.entries()) {
      records[hash] = meta;
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), "utf8");
  } catch (err) {
    console.warn("[metadataStore] Could not persist metadata:", err);
  }
}

// Load on initialization
loadPersisted();

// Seed standard fallback/default tasks so any demo/seed jobs can resolve if needed
const DEFAULT_TASKS: Record<string, JobMetadata> = {
  MOVE_OBJECT: {
    taskType: "MOVE_OBJECT",
    source: { x: 100, y: 300 },
    target: { x: 600, y: 300 },
    description: "Move package A to green zone",
  },
  PICK_AND_PLACE: {
    taskType: "PICK_AND_PLACE",
    source: { x: 150, y: 150 },
    target: { x: 550, y: 450 },
    description: "Pick and place component B",
  },
  LOAD_AND_DUMP: {
    taskType: "LOAD_AND_DUMP",
    source: { x: 120, y: 400 },
    target: { x: 620, y: 400 },
    description: "Load earth and dump at site C",
  },
  DELIVERY: {
    taskType: "DELIVERY",
    source: { x: 80, y: 220 },
    target: { x: 640, y: 220 },
    description: "Express delivery to warehouse D",
  },
  PACKAGE_TRANSPORT: {
    taskType: "PACKAGE_TRANSPORT",
    source: { x: 100, y: 300 },
    target: { x: 600, y: 300 },
    description: "Move package from Warehouse A to Warehouse B",
    machineId: "M-042",
    pickupLocation: "Warehouse A",
    destination: "Warehouse B",
    distanceKm: 5,
    packageWeightKg: 10,
  },
  COLOR_SORTING: {
    taskType: "COLOR_SORTING",
    source: { x: 150, y: 150 },
    target: { x: 550, y: 450 },
    description: "Sort 100 objects into 4 colors with 95% accuracy",
    machineId: "M-051",
    objectCount: 100,
    colors: ["RED", "BLUE", "GREEN", "YELLOW"],
    requiredAccuracyPercent: 95,
  },
};

// Seed description-based metadata hashes (e.g. keccak256(utf8(description)))
for (const task of Object.values(DEFAULT_TASKS)) {
  const metaStr = canonicalJson(task);
  const hash = keccak256(toUtf8Bytes(metaStr)).toLowerCase();
  metadataByHash.set(hash, task);

  if (task.description) {
    // Also map keccak256(utf8(description)) to the default task for backwards compatibility
    const descHash = keccak256(toUtf8Bytes(task.description)).toLowerCase();
    if (!metadataByHash.has(descHash)) {
      metadataByHash.set(descHash, task);
    }
  }
}

export function computeMetadataHash(metadata: JobMetadata): { hash: string; canonicalStr: string } {
  const canonicalStr = canonicalJson(metadata);
  const hash = keccak256(toUtf8Bytes(canonicalStr)).toLowerCase();
  return { hash, canonicalStr };
}

export function storeMetadata(input: JobMetadataInput): {
  metadata: JobMetadata;
  metadataHash: string;
  canonicalJsonStr: string;
} {
  const taskType = input.taskType || "MOVE_OBJECT";
  const defaultTask = DEFAULT_TASKS[taskType] || DEFAULT_TASKS.MOVE_OBJECT;

  const metadata: JobMetadata = {
    taskType,
    source: input.source || defaultTask.source,
    target: input.target || defaultTask.target,
    simulateFailure: Boolean(input.simulateFailure),
    description: input.description || defaultTask.description,
    machineId: input.machineId || defaultTask.machineId,
    pickupLocation: input.pickupLocation || defaultTask.pickupLocation,
    destination: input.destination || defaultTask.destination,
    distanceKm: input.distanceKm ?? defaultTask.distanceKm,
    packageWeightKg: input.packageWeightKg ?? defaultTask.packageWeightKg,
    objectCount: input.objectCount ?? defaultTask.objectCount,
    colors: input.colors || defaultTask.colors,
    requiredAccuracyPercent: input.requiredAccuracyPercent ?? defaultTask.requiredAccuracyPercent,
    pricing: input.pricing,
  };

  const { hash, canonicalStr } = computeMetadataHash(metadata);
  metadataByHash.set(hash, metadata);

  if (metadata.description) {
    const descHash = keccak256(toUtf8Bytes(metadata.description)).toLowerCase();
    metadataByHash.set(descHash, metadata);
  }

  persistStore();

  return {
    metadata,
    metadataHash: hash,
    canonicalJsonStr: canonicalStr,
  };
}

export function getMetadataByHash(hash: string): JobMetadata | undefined {
  return metadataByHash.get(hash.toLowerCase());
}

export function verifyMetadata(
  metadata: JobMetadata,
  expectedHash: string
): boolean {
  const { hash } = computeMetadataHash(metadata);
  return hash === expectedHash.toLowerCase();
}
