import { describe, it, expect, beforeEach } from "vitest";
import { addressBook, AddressBookEntry } from "./addressBook";

describe("lib/addressBook.ts Unit Tests", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("CRUD round-trips through localStorage", () => {
    const testEntry = {
      address: "0x1111111111111111111111111111111111111111",
      label: "Custom Robot Drone",
      tag: "machine" as const,
      notes: "Alpha unit",
    };

    // Create
    addressBook.set(testEntry);

    // Read
    const retrieved = addressBook.get(testEntry.address);
    expect(retrieved).toBeDefined();
    expect(retrieved?.label).toBe("Custom Robot Drone");
    expect(retrieved?.tag).toBe("machine");
    expect(retrieved?.notes).toBe("Alpha unit");

    // Update
    addressBook.set({
      ...testEntry,
      label: "Custom Robot Drone v2",
    });
    const updated = addressBook.get(testEntry.address);
    expect(updated?.label).toBe("Custom Robot Drone v2");

    // Delete
    addressBook.remove(testEntry.address);
    expect(addressBook.get(testEntry.address)).toBeUndefined();
  });

  it("resolve() returns label for known address, falls back to truncated hex for unknown", () => {
    const knownAddress = "0x2222222222222222222222222222222222222222";
    addressBook.set({
      address: knownAddress,
      label: "Known Fleet Robot",
      tag: "machine",
    });

    // Known address resolution
    const resolvedKnown = addressBook.resolve(knownAddress);
    expect(resolvedKnown.isKnown).toBe(true);
    expect(resolvedKnown.label).toBe("Known Fleet Robot");
    expect(resolvedKnown.truncated).toBe("0x2222…2222");
    expect(resolvedKnown.tag).toBe("machine");

    // Unknown address resolution
    const unknownAddress = "0x9999999999999999999999999999999999999999";
    const resolvedUnknown = addressBook.resolve(unknownAddress);
    expect(resolvedUnknown.isKnown).toBe(false);
    expect(resolvedUnknown.label).toBe("0x9999…9999");
    expect(resolvedUnknown.truncated).toBe("0x9999…9999");
    expect(resolvedUnknown.tag).toBe("unknown");

    // Null/undefined address resolution
    const resolvedNull = addressBook.resolve(null);
    expect(resolvedNull.isKnown).toBe(false);
    expect(resolvedNull.label).toBe("Unknown");
  });

  it("Import rejects malformed JSON without corrupting existing storage", () => {
    // Seed initial entry
    const initial = {
      address: "0x3333333333333333333333333333333333333333",
      label: "Initial Trusted Wallet",
      tag: "client" as const,
    };
    addressBook.set(initial);
    const countBefore = addressBook.getAll().length;

    // 1. Missing required field (label missing)
    const malformed1 = JSON.stringify([
      { address: "0x4444444444444444444444444444444444444444" },
    ]);
    const res1 = addressBook.importJson(malformed1);
    expect(res1.success).toBe(false);
    expect(res1.count).toBe(0);
    expect(addressBook.getAll().length).toBe(countBefore);
    expect(addressBook.get(initial.address)?.label).toBe("Initial Trusted Wallet");

    // 2. Bad address format (not a valid 42-char hex address)
    const malformed2 = JSON.stringify([
      { address: "not-an-eth-address", label: "Bad Entity" },
    ]);
    const res2 = addressBook.importJson(malformed2);
    expect(res2.success).toBe(false);
    expect(res2.count).toBe(0);
    expect(addressBook.getAll().length).toBe(countBefore);

    // 3. Not an array
    const malformed3 = JSON.stringify({
      address: "0x4444444444444444444444444444444444444444",
      label: "Single Object",
    });
    const res3 = addressBook.importJson(malformed3);
    expect(res3.success).toBe(false);
    expect(addressBook.getAll().length).toBe(countBefore);

    // 4. Valid JSON import succeeds atomically
    const validBatch = JSON.stringify([
      {
        address: "0x5555555555555555555555555555555555555555",
        label: "Imported Machine #1",
        tag: "machine",
      },
      {
        address: "0x6666666666666666666666666666666666666666",
        label: "Imported Machine #2",
        tag: "machine",
      },
    ]);
    const resValid = addressBook.importJson(validBatch);
    expect(resValid.success).toBe(true);
    expect(resValid.count).toBe(2);
    expect(addressBook.get("0x5555555555555555555555555555555555555555")?.label).toBe("Imported Machine #1");
  });
});
