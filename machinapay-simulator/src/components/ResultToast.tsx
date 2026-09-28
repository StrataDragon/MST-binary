import type { JobCompletedMessage, JobFailedMessage } from "../integration/protocol";

export function ResultToast({ result }: { result: JobCompletedMessage | JobFailedMessage | null }) {
  if (!result) return null;

  if (result.status === "SUCCESS") {
    return (
      <div className="result-toast success">
        TASK COMPLETED ✅ &nbsp;·&nbsp; OBJECT DELIVERED ✅ &nbsp;·&nbsp; WAITING FOR NEXT JOB…
      </div>
    );
  }

  return (
    <div className="result-toast fail">
      JOB FAILED ✕ &nbsp;·&nbsp; REASON: {result.reason} &nbsp;·&nbsp; RETURNING TO IDLE…
    </div>
  );
}
