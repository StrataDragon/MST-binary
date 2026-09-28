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
    backendOnline,
    robotState,
    phaseProgress,
    currentJob,
    timeline,
    lastResult,
    verification,
    executionSeconds,
    isMockMode,
    batteryPercent,
    sendTestJob,
  } = useMachineConnection();

  return (
    <div className="app-shell">
      <header className="app-header">
        <TopBar
          connectionStatus={connectionStatus}
          backendOnline={backendOnline}
          jobId={currentJob?.jobId ?? null}
          reward={currentJob?.reward}
          taskType={currentJob?.taskType ?? null}
        />
      </header>

      <main className="app-main">
        <aside className="side-panel left">
          <JobPanel job={currentJob} executionSeconds={executionSeconds} result={lastResult} verification={verification} />
        </aside>

        <div className="stage">
          <Scene3D
            state={robotState}
            phaseProgress={phaseProgress}
            reward={currentJob?.reward ?? "100"}
            source={currentJob?.source}
            target={currentJob?.target}
            taskType={currentJob?.taskType ?? null}
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
            verification={verification}
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
