import { cfg } from "./config";

export interface AddressBookEntry {
  address: string;
  label: string;
  tag: "machine" | "client" | "contract" | "unknown";
  notes?: string;
  createdAt: number;
}

const STORAGE_KEY = "machinapay_address_book_v1";

// Pre-seeded well-known addresses from deployed contracts and Hardhat node
const DEFAULT_ENTRIES: AddressBookEntry[] = [
  {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase(),
    label: "Deployer / Client Wallet",
    tag: "client",
    notes: "Default account #0 on Hardhat local node",
    createdAt: Date.now(),
  },
  {
    address: "0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1".toLowerCase(),
    label: "Machine M-042 Agent",
    tag: "machine",
    notes: "Autonomous ground robot identity wallet",
    createdAt: Date.now(),
  },
  {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8".toLowerCase(),
    label: "Demo Customer Account",
    tag: "client",
    notes: "Default account #1 on local node",
    createdAt: Date.now(),
  },
  {
    address: cfg.addresses.JobEscrow.toLowerCase(),
    label: "JobEscrow Contract",
    tag: "contract",
    notes: "Non-custodial escrow settlement vault",
    createdAt: Date.now(),
  },
  {
    address: cfg.addresses.MachineRegistry.toLowerCase(),
    label: "MachineRegistry Contract",
    tag: "contract",
    notes: "Hardware identity & stake registry",
    createdAt: Date.now(),
  },
  {
    address: cfg.verifier.toLowerCase(),
    label: "Member 3 Verifier Wallet",
    tag: "contract",
    notes: "Off-chain verification service signer",
    createdAt: Date.now(),
  },
];

export const addressBook = {
  getAll(): AddressBookEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ENTRIES));
        return DEFAULT_ENTRIES;
      }
      return JSON.parse(raw);
    } catch {
      return DEFAULT_ENTRIES;
    }
  },

  get(address: string): AddressBookEntry | undefined {
    const list = this.getAll();
    return list.find((e) => e.address.toLowerCase() === address.toLowerCase());
  },

  set(entry: Omit<AddressBookEntry, "createdAt">): void {
    const list = this.getAll();
    const cleanAddr = entry.address.toLowerCase();
    const existingIdx = list.findIndex((e) => e.address.toLowerCase() === cleanAddr);

    if (existingIdx !== -1) {
      list[existingIdx] = { ...list[existingIdx], ...entry, address: cleanAddr };
    } else {
      list.push({ ...entry, address: cleanAddr, createdAt: Date.now() });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  },

  remove(address: string): void {
    const list = this.getAll().filter((e) => e.address.toLowerCase() !== address.toLowerCase());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  },

  importJson(jsonString: string): { success: boolean; count: number; error?: string } {
    try {
      const parsed = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) {
        return { success: false, count: 0, error: "JSON must be an array of address entries" };
      }
      if (parsed.length === 0) {
        return { success: false, count: 0, error: "Address book import array cannot be empty" };
      }

      // First pass: validate all items without touching existing storage
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        if (!item || typeof item !== "object") {
          return { success: false, count: 0, error: `Item at index ${i} is not a valid object` };
        }
        if (!item.address || typeof item.address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(item.address.trim())) {
          return {
            success: false,
            count: 0,
            error: `Item at index ${i} has invalid or missing Ethereum address format (0x...)`,
          };
        }
        if (!item.label || typeof item.label !== "string" || !item.label.trim()) {
          return { success: false, count: 0, error: `Item at index ${i} is missing a required label` };
        }
      }

      // Second pass: apply atomically
      let count = 0;
      for (const item of parsed) {
        this.set({
          address: item.address.trim(),
          label: item.label.trim(),
          tag: item.tag || "unknown",
          notes: item.notes,
        });
        count++;
      }
      return { success: true, count };
    } catch (e: any) {
      return { success: false, count: 0, error: e?.message || "Invalid JSON payload" };
    }
  },

  exportJson(): string {
    return JSON.stringify(this.getAll(), null, 2);
  },

  /**
   * Resolves an address to `{ label, truncated, tag }`.
   * Everywhere an address is shown, this is called to provide label + truncated address tooltip.
   */
  resolve(address?: string | null): { label: string; truncated: string; tag: string; isKnown: boolean } {
    if (!address) return { label: "Unknown", truncated: "0x0000…0000", tag: "unknown", isKnown: false };
    const truncated = `${address.slice(0, 6)}…${address.slice(-4)}`;
    const found = this.get(address);
    if (found) {
      return { label: found.label, truncated, tag: found.tag, isKnown: true };
    }
    return { label: truncated, truncated, tag: "unknown", isKnown: false };
  },
};
