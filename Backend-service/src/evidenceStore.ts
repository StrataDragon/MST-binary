import * as fs from "fs";
import * as path from "path";

export interface EvidenceRecord {
  jobId: string;
  machineId: string;
  taskType: string;
  sourcePosition: { x: number; y: number };
  targetPosition: { x: number; y: number };
  finalPosition: { x: number; y: number };
  objectDelivered: boolean;
  completedAt: string;
  simulateFailure?: boolean;
}

const DATA_DIR = path.join(__dirname, "..", "data");
const EVIDENCE_FILE = path.join(DATA_DIR, "evidence_store.json");

const evidenceByJobId = new Map<string, EvidenceRecord>();

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadPersisted() {
  try {
    ensureDir();
    if (fs.existsSync(EVIDENCE_FILE)) {
      const content = fs.readFileSync(EVIDENCE_FILE, "utf8");
      const records = JSON.parse(content) as Record<string, EvidenceRecord>;
      for (const [jobId, ev] of Object.entries(records)) {
        evidenceByJobId.set(jobId.toLowerCase(), ev);
      }
    }
  } catch (err) {
    console.warn("[evidenceStore] Could not load persisted evidence:", err);
  }
}

function persistStore() {
  try {
    ensureDir();
    const records: Record<string, EvidenceRecord> = {};
    for (const [jobId, ev] of evidenceByJobId.entries()) {
      records[jobId] = ev;
    }
    fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(records, null, 2), "utf8");
  } catch (err) {
    console.warn("[evidenceStore] Could not persist evidence:", err);
  }
}

loadPersisted();

export function storeEvidence(jobId: string, evidence: EvidenceRecord): void {
  evidenceByJobId.set(jobId.toLowerCase(), evidence);
  persistStore();
}

export function getEvidence(jobId: string): EvidenceRecord | undefined {
  return evidenceByJobId.get(jobId.toLowerCase());
}

export function listAllEvidence(): Record<string, EvidenceRecord> {
  const result: Record<string, EvidenceRecord> = {};
  for (const [jobId, ev] of evidenceByJobId.entries()) {
    result[jobId] = ev;
  }
  return result;
}
