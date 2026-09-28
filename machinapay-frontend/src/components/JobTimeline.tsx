import React from "react";
import { Check, Clock, AlertTriangle, ExternalLink, ArrowRight } from "lucide-react";
import { cfg } from "../lib/config";

interface JobTimelineProps {
  state: number; // 0: CREATED, 1: FUNDED, 2: ACCEPTED, 3: EXECUTING, 4: PROOF_SUBMITTED, 5: VERIFIED, 6: PAID, 7: REFUNDED
  verdict: number; // 0: NONE, 1: PASS, 2: FAIL
  createdAt?: number;
  deadline?: number;
  txHash?: string;
}

export function JobTimeline({ state, verdict, createdAt, deadline, txHash }: JobTimelineProps) {
  const isRefunded = state === 7;
  const isDisputed = state === 4 && verdict === 2;

  const steps = [
    {
      id: "created",
      title: "Created",
      subtitle: "Escrow Defined",
      isReached: state >= 0,
      isCurrent: state === 0,
      timestamp: createdAt ? new Date(createdAt * 1000).toLocaleTimeString() : "Block confirmed",
    },
    {
      id: "funded",
      title: "Funded",
      subtitle: "Native MST Locked",
      isReached: state >= 1,
      isCurrent: state === 1,
      timestamp: state >= 1 ? "Deposited" : "Awaiting",
    },
    {
      id: "progress",
      title: "In Progress",
      subtitle: "Machine Dispatched",
      isReached: state >= 2,
      isCurrent: state === 2 || state === 3,
      timestamp: state >= 2 ? "Execution Started" : "Queued",
    },
    {
      id: "delivered",
      title: "Delivered",
      subtitle: "Sensor Proof Signed",
      isReached: state >= 4,
      isCurrent: state === 4 || state === 5,
      timestamp: state >= 4 ? "Evidence Transmitted" : "In Transit",
    },
    {
      id: "settled",
      title: isRefunded ? "Refunded" : "Settled",
      subtitle: isRefunded ? "Returned to Client" : "Payment Released",
      isReached: state >= 6,
      isCurrent: state === 6 || state === 7,
      isFailed: isRefunded || isDisputed,
      timestamp: state >= 6 ? "Finalized on Chain" : "Awaiting Attestation",
    },
  ];

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-4 space-y-3 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="text-[11px] font-bold text-secondary uppercase tracking-wider">
          Job Lifecycle Stepper
        </span>
        {txHash && (
          <span className="text-[10px] text-accent-blue flex items-center gap-1">
            <span>Tx: {txHash.slice(0, 10)}…</span>
            <ExternalLink className="w-3 h-3" />
          </span>
        )}
      </div>

      {/* Stepper Bar */}
      <div className="relative pt-2 pb-2">
        <div className="flex items-center justify-between relative z-10">
          {steps.map((step, idx) => {
            const isLast = idx === steps.length - 1;

            return (
              <div key={step.id} className="flex-1 flex flex-col items-center text-center relative">
                {/* Circle Marker */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center border font-bold text-[11px] transition-all ${
                    step.isFailed
                      ? "bg-red-50 text-accent-red border-red-300 ring-2 ring-red-100"
                      : step.isReached
                      ? "bg-green-50 text-accent-green border-green-300 ring-2 ring-green-100"
                      : "bg-page text-muted border-border"
                  }`}
                >
                  {step.isFailed ? (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  ) : step.isReached ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                {/* Step Labels */}
                <div className="mt-2 space-y-0.5">
                  <div
                    className={`font-bold text-[11px] ${
                      step.isFailed
                        ? "text-accent-red"
                        : step.isReached
                        ? "text-primary"
                        : "text-muted"
                    }`}
                  >
                    {step.title}
                  </div>
                  <div className="text-[10px] text-muted hidden sm:block">{step.subtitle}</div>
                  <div className="text-[9px] text-secondary">{step.timestamp}</div>
                </div>

                {/* Connector line to next step */}
                {!isLast && (
                  <div
                    className={`hidden sm:block absolute top-3.5 left-1/2 w-full h-0.5 -z-10 ${
                      step.isReached && steps[idx + 1].isReached
                        ? "bg-accent-green"
                        : "bg-border"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Red Disputed Branch if Job was Rejected/Refunded */}
        {isRefunded && (
          <div className="mt-4 p-2.5 rounded bg-red-50 border border-red-200 flex items-center justify-between text-xs text-accent-red">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>
                <strong>Dispute / Refund Triggered</strong> — Sensor proof tolerance exceeded or execution expired.
              </span>
            </div>
            <span className="font-bold uppercase text-[10px] px-2 py-0.5 rounded bg-white border border-red-200">
              Escrow Returned
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
