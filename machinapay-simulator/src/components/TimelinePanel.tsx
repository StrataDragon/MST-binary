import type { TimelineStep } from "../hooks/useMachineConnection";
import type { RobotState, ChainStage } from "../integration/protocol";

export function TimelinePanel({
  timeline,
  robotState,
  phaseProgress,
  resultSent,
  chainStage,
}: {
  timeline: TimelineStep[];
  robotState: RobotState;
  phaseProgress: number;
  resultSent: boolean;
  chainStage?: ChainStage | null;
}) {
  const activeIndex = timeline.findIndex((t) => t.state === robotState);
  const isVerified = chainStage === "VERIFIED" || chainStage === "PAID" || chainStage === "REFUNDED";
  const isPaid = chainStage === "PAID";
  const isRefunded = chainStage === "REFUNDED";

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
          <div className={`timeline-item ${isVerified ? "done" : ""}`}>
            <span className="check">{isVerified ? "✓" : ""}</span>
            <span>Awaiting Backend Verification</span>
          </div>
          {isPaid && (
            <div className="timeline-item done">
              <span className="check">✓</span>
              <span>Payment Released</span>
            </div>
          )}
          {isRefunded && (
            <div className="timeline-item done">
              <span className="check">✓</span>
              <span>Refunded</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

