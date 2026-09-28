import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MachinaPayPrivyProvider, isValidPrivyAppId, useSafePrivy } from "./PrivyProvider";
import { ConnectWallet } from "./components/ConnectWallet";
import App from "./App";

describe("PrivyProvider validation & rendering", () => {
  it("correctly identifies valid vs dummy/missing app IDs", () => {
    expect(isValidPrivyAppId(null)).toBe(false);
    expect(isValidPrivyAppId(undefined)).toBe(false);
    expect(isValidPrivyAppId("")).toBe(false);
    expect(isValidPrivyAppId("cl00000000000000000000000")).toBe(false); // dummy ID
    expect(isValidPrivyAppId("invalid-id")).toBe(false);
    expect(isValidPrivyAppId("cl1234567890abcdef1234567")).toBe(true);
    expect(isValidPrivyAppId("cm9876543210fedcba8765432")).toBe(true);
  });

  it("missing ID does not crash and button shows 'Privy not configured'", () => {
    render(
      <MachinaPayPrivyProvider appIdOverride={null}>
        <ConnectWallet onConnected={() => {}} />
      </MachinaPayPrivyProvider>
    );

    const button = screen.getByRole("button", { name: /privy not configured/i });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("title")).toContain("Privy not configured");
  });

  it("dummy ID does not crash and button shows 'Privy not configured'", () => {
    render(
      <MachinaPayPrivyProvider appIdOverride="cl00000000000000000000000">
        <ConnectWallet onConnected={() => {}} />
      </MachinaPayPrivyProvider>
    );

    const button = screen.getByRole("button", { name: /privy not configured/i });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("valid-format ID mounts provider and exposes isConfigured=true", () => {
    function TestConsumer() {
      const { isConfigured } = useSafePrivy();
      return <div data-testid="is-configured">{isConfigured ? "yes" : "no"}</div>;
    }

    render(
      <MachinaPayPrivyProvider appIdOverride="cl1234567890abcdef1234567">
        <TestConsumer />
      </MachinaPayPrivyProvider>
    );

    const element = screen.getByTestId("is-configured");
    expect(element.textContent).toBe("yes");
  });

  it("renders App without crashing when Privy is unconfigured", () => {
    render(
      <MachinaPayPrivyProvider appIdOverride={null}>
        <App />
      </MachinaPayPrivyProvider>
    );
  });
});
