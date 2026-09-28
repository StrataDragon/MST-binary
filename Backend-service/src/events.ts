/**
 * Listens for the escrow's settlement events so the job store (and console log,
 * useful during the demo) stays in sync even if a settlement is triggered by
 * someone other than this process (anyone may call release()/refund()).
 */
import { getEscrow } from "./config";
import { machineIdToString } from "./signing";
import { upsertJob } from "./store";

export function startEventListeners() {
  const escrow = getEscrow();

  escrow.on("PaymentReleased", (jobId: string, machineId: string, wallet: string, amount: bigint) => {
    console.log(
      `[event] PaymentReleased job=${jobId.slice(0, 10)}… machine=${machineIdToString(machineId)} ` +
        `wallet=${wallet} amount=${amount}`
    );
    upsertJob(jobId, { stage: "paid" });
  });

  escrow.on("JobRefunded", (jobId: string, customer: string, amount: bigint, reason: number) => {
    const reasons = ["CUSTOMER_CANCELLED", "EXPIRED", "VERIFICATION_FAILED"];
    console.log(
      `[event] JobRefunded job=${jobId.slice(0, 10)}… customer=${customer} amount=${amount} ` +
        `reason=${reasons[reason] ?? reason}`
    );
    upsertJob(jobId, { stage: "refunded" });
  });

  console.log("[events] listening for PaymentReleased / JobRefunded");
}
