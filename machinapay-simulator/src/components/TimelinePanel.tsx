import type { TimelineStep, VerificationInfo } from "../hooks/useMachineConnection";
import type { RobotState } from "../integration/protocol";

export function TimelinePanel({
  timeline,
  robotState,
  phaseProgress,
  resultSent,
  verification,
}: {
  timeline: TimelineStep[];
  robotState: RobotState;
  phaseProgress: number;
  resultSent: boolean;
  verification?: VerificationInfo | null;
}) {
  const activeIndex = timeline.findIndex((t) => t.state === robotState);

  return (
    <div className="panel timeline-panel">
      <div className="panel-title">EXECUTION TIMELINE</div>
      {timeline.map((step, i) => (
        <div key={step.state} className={`timeline-item ${step.done ? "done" : ""} ${i === activeIndex ? "active" : ""}`}>
          <span className="check">{step.done ? "✓" : ""}</span>
          <span>{step.label}</span>
        </div>
      ))}
      {activeIndex >= 0 && robotState !== "COMPLETED" && (
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${Math.round(phaseProgress * 100)}%` }} />
        </div>
      )}

      {resultSent && (
        <>
          <div className="timeline-item done">
            <span className="check">✓</span>
            <span>Result Sent to Backend</span>
          </div>

          {verification?.submitProofTx ? (
            <>
              <div className="timeline-item done">
                <span className="check">✓</span>
                <span title={`Tx: ${verification.submitProofTx}`}>
                  Proof Submitted: {verification.submitProofTx.slice(0, 10)}…
                </span>
              </div>
              <div className={`timeline-item ${verification.passed ? "done" : "fail"}`}>
                <span className="check">{verification.passed ? "✓" : "✕"}</span>
                <span title={verification.settleTx ? `Settle Tx: ${verification.settleTx}` : undefined}>
                  {verification.passed ? "Verifier Settled (PAID)" : "Verifier Rejected (REFUNDED)"}
                  {verification.settleTx ? ` · ${verification.settleTx.slice(0, 8)}…` : ""}
                </span>
              </div>
            </>
          ) : verification?.error ? (
            <div className="timeline-item fail">
              <span className="check">✕</span>
              <span>Backend: {verification.error}</span>
            </div>
          ) : (
            <div className="timeline-item">
              <span className="check" />
              <span>Awaiting Backend Verification</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
