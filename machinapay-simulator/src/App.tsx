import { useMachineConnection } from "./hooks/useMachineConnection";
import { Scene3D } from "./components/Scene3D";
import { TopBar, StateBanner } from "./components/StatusHeader";
import { JobPanel } from "./components/JobPanel";
import { TimelinePanel } from "./components/TimelinePanel";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { MockControls } from "./components/MockControls";
import { ResultToast } from "./components/ResultToast";

export default function App() {
  const {
    connectionStatus,
    robotState,
    phaseProgress,
    currentJob,
    timeline,
    lastResult,
    executionSeconds,
    isMockMode,
    batteryPercent,
    sendTestJob,
    chainStage,
    txHash,
    chainReward,
  } = useMachineConnection();

  return (
    <div className="app-shell">
      <header className="app-header">
        <TopBar
          connectionStatus={connectionStatus}
          jobId={currentJob?.jobId ?? null}
          reward={chainReward ?? currentJob?.reward}
          taskType={currentJob?.taskType ?? null}
          chainStage={chainStage}
          txHash={txHash}
        />
      </header>

      <main className="app-main">
        <aside className="side-panel left">
          <JobPanel job={currentJob} executionSeconds={executionSeconds} result={lastResult} />
        </aside>

        <div className="stage">
          <Scene3D
            state={robotState}
            phaseProgress={phaseProgress}
            reward={chainReward ?? currentJob?.reward ?? "100"}
            source={currentJob?.source}
            target={currentJob?.target}
            taskType={currentJob?.taskType ?? null}
            isPaid={isMockMode ? robotState === "COMPLETED" : chainStage === "PAID"}
          />
          <div className="stage-vignette" />
          <div className="stage-scanlines" />

          <div className="stage-overlay">
            <StateBanner robotState={robotState} taskType={currentJob?.taskType ?? null} />
            {(robotState === "COMPLETED" || robotState === "FAILED") && <ResultToast result={lastResult} />}
          </div>
        </div>

        <aside className="side-panel right">
          <TimelinePanel
            timeline={timeline}
            robotState={robotState}
            phaseProgress={phaseProgress}
            resultSent={lastResult !== null}
            chainStage={chainStage}
          />
        </aside>
      </main>


      <div className="telemetry-row">
        <TelemetryPanel robotState={robotState} phaseProgress={phaseProgress} job={currentJob} batteryPercent={batteryPercent} />
      </div>

      <footer className="app-footer">{isMockMode && <MockControls onSendJob={sendTestJob} robotState={robotState} />}</footer>
    </div>
  );
}
