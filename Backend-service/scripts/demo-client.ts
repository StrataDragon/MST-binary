/**
 * Exercises the whole Member 3 flow against your OWN running server, standing
 * in for Member 2's robot + Member 4's dashboard until they're ready.
 *
 *   JOB_ID=0x... npm run demo             (happy path)
 *   JOB_ID=0x... npm run demo -- fail     (verification fails -> refund)
 *
 * Get a JOB_ID by running Member 1's `npm run seed:local` in their repo and
 * reading deployments/demo.json, or by creating a job yourself against
 * JobEscrow with any ethers script / MetaMask + a contract-call UI.
 */
const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

async function main() {
  const jobId = process.env.JOB_ID;
  if (!jobId) {
    throw new Error("Set JOB_ID (bytes32 job id) — see deployments/demo.json in Member 1's repo after seed:local");
  }
  const mode = process.argv[2] === "fail" ? "fail" : "success";

  console.log(`[demo] health check...`);
  console.log(await (await fetch(`${BASE_URL}/health`)).json());

  console.log(`\n[demo] accepting + starting job ${jobId}...`);
  const acceptRes = await fetch(`${BASE_URL}/machine/jobs/${jobId}/accept`, { method: "POST" });
  console.log(await acceptRes.json());
  if (!acceptRes.ok) return;

  const packageId = process.env.DEMO_PACKAGE_ID || "A";
  const targetZone = process.env.DEMO_TARGET_ZONE || "green";
  const targetX = Number(process.env.DEMO_TARGET_X ?? 9);
  const targetY = Number(process.env.DEMO_TARGET_Y ?? 4);

  console.log(`\n[demo] (pretend Member 2's robot just moved the package) sending evidence, mode=${mode}...`);
  const evidenceRes = await fetch(`${BASE_URL}/machine/jobs/${jobId}/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      packageId,
      target: { zone: targetZone, x: targetX, y: targetY },
      finalPosition: mode === "success" ? { x: targetX, y: targetY } : { x: 1, y: 1 },
      delivered: mode === "success",
      result: mode,
    }),
  });
  console.log(JSON.stringify(await evidenceRes.json(), null, 2));

  console.log(`\n[demo] final job status:`);
  console.log(await (await fetch(`${BASE_URL}/jobs/${jobId}`)).json());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
