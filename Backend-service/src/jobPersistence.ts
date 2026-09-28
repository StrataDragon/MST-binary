import * as fs from "fs";
import * as path from "path";

export interface ProcessedJobRecord {
  jobId: string;
  stage: string;
  accepted?: boolean;
  executing?: boolean;
  proofSubmitted?: boolean;
  verified?: boolean;
  settled?: boolean;
  verdict?: "PASS" | "FAIL";
  updatedAt: string;
}

const DATA_DIR = path.join(__dirname, "..", "data");
const PERSISTENCE_FILE = path.join(DATA_DIR, "jobs_processed.json");

const processedJobs = new Map<string, ProcessedJobRecord>();

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadPersisted() {
  try {
    ensureDir();
    if (fs.existsSync(PERSISTENCE_FILE)) {
      const content = fs.readFileSync(PERSISTENCE_FILE, "utf8");
      const records = JSON.parse(content) as Record<string, ProcessedJobRecord>;
      for (const [jobId, rec] of Object.entries(records)) {
        processedJobs.set(jobId.toLowerCase(), rec);
      }
    }
  } catch (err) {
    console.warn("[jobPersistence] Could not load processed jobs:", err);
  }
}

function persistRecords() {
  try {
    ensureDir();
    const records: Record<string, ProcessedJobRecord> = {};
    for (const [jobId, rec] of processedJobs.entries()) {
      records[jobId] = rec;
    }
    fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(records, null, 2), "utf8");
  } catch (err) {
    console.warn("[jobPersistence] Could not persist processed jobs:", err);
  }
}

loadPersisted();

export function getProcessedJob(jobId: string): ProcessedJobRecord | undefined {
  return processedJobs.get(jobId.toLowerCase());
}

export function isJobActionDone(
  jobId: string,
  action: "accepted" | "executing" | "proofSubmitted" | "verified" | "settled"
): boolean {
  const rec = processedJobs.get(jobId.toLowerCase());
  return Boolean(rec && rec[action]);
}

export function updateProcessedJob(
  jobId: string,
  updates: Partial<ProcessedJobRecord>
): ProcessedJobRecord {
  const key = jobId.toLowerCase();
  const existing = processedJobs.get(key) || {
    jobId,
    stage: "unknown",
    updatedAt: new Date().toISOString(),
  };

  const updated: ProcessedJobRecord = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  processedJobs.set(key, updated);
  persistRecords();
  return updated;
}
