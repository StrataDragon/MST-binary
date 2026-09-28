import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { JobTimeline } from "./JobTimeline";

describe("JobTimeline Component & State Derivation Tests", () => {
  it("renders FUNDED state correctly (Creation & Funding stage)", () => {
    // State 1: FUNDED, Verdict 0: NONE
    const { container } = render(
      <JobTimeline state={1} verdict={0} createdAt={1700000000} txHash="0xabc123" />
    );

    // Created and Funded are reached
    expect(screen.getByText("Created")).toBeDefined();
    expect(screen.getByText("Funded")).toBeDefined();
    expect(screen.getByText("Deposited")).toBeDefined();

    // In Progress is not reached yet
    expect(screen.getByText("Queued")).toBeDefined();
  });

  it("renders EXECUTING state correctly (In Progress stage)", () => {
    // State 3: EXECUTING, Verdict 0: NONE
    render(<JobTimeline state={3} verdict={0} />);

    expect(screen.getByText("In Progress")).toBeDefined();
    expect(screen.getByText("Execution Started")).toBeDefined();
    expect(screen.getByText("In Transit")).toBeDefined();
  });

  it("renders PROOF_SUBMITTED and VERIFIED states correctly (Delivered stage)", () => {
    // State 5: VERIFIED, Verdict 1: PASS
    render(<JobTimeline state={5} verdict={1} />);

    expect(screen.getByText("Delivered")).toBeDefined();
    expect(screen.getByText("Evidence Transmitted")).toBeDefined();
    expect(screen.getByText("Awaiting Attestation")).toBeDefined();
  });

  it("renders PAID state correctly (Settled stage - Happy Path)", () => {
    // State 6: PAID, Verdict 1: PASS
    render(<JobTimeline state={6} verdict={1} />);

    expect(screen.getByText("Settled")).toBeDefined();
    expect(screen.getByText("Payment Released")).toBeDefined();
    expect(screen.getByText("Finalized on Chain")).toBeDefined();

    // No dispute banner
    expect(screen.queryByText(/Dispute \/ Refund Triggered/)).toBeNull();
  });

  it("renders REFUNDED state correctly with red dispute branch", () => {
    // State 7: REFUNDED, Verdict 2: FAIL
    render(<JobTimeline state={7} verdict={2} />);

    expect(screen.getByText("Refunded")).toBeDefined();
    expect(screen.getByText("Returned to Client")).toBeDefined();

    // Red dispute branch must be rendered
    expect(screen.getByText(/Dispute \/ Refund Triggered/)).toBeDefined();
    expect(screen.getByText("Escrow Returned")).toBeDefined();
  });
});
