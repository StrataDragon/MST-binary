import { describe, it, expect, vi, beforeEach } from "vitest";
import { priceFeed } from "./priceFeed";

describe("lib/priceFeed.ts Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles API failure/timeout gracefully without throwing into render paths", async () => {
    // Mock fetch to simulate network error or timeout
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network connection timed out"));

    // Must not throw error
    let price: number | null = null;
    await expect(
      (async () => {
        price = await priceFeed.getEthPriceUsd();
      })()
    ).resolves.not.toThrow();

    expect(price).toBeTypeOf("number");
    expect(price).toBeGreaterThan(0);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("handles non-OK HTTP status codes gracefully without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Rate Limit Exceeded",
      json: async () => ({}),
    } as any);

    const price = await priceFeed.getEthPriceUsd();
    expect(price).toBeTypeOf("number");
    expect(price).toBeGreaterThan(0);
  });

  it("toUsdString formats values gracefully with valid, zero, or invalid inputs", () => {
    // Valid conversion
    const formatted = priceFeed.toUsdString("1.0", 3000.0);
    expect(formatted).toBe("$3,000.00 USD");

    // Zero balance
    const zeroFormatted = priceFeed.toUsdString("0", 3000.0);
    expect(zeroFormatted).toBe("$0.00 USD");

    // Invalid / NaN string
    const invalidFormatted = priceFeed.toUsdString("invalid-number", 3000.0);
    expect(invalidFormatted).toBe("$0.00 USD");
  });
});
