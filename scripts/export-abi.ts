import * as fs from "fs";
import * as path from "path";
import hre from "hardhat";

async function main() {
  console.log("Exporting ABIs from compiled Hardhat artifacts...");
  await hre.run("compile");

  const registryArtifact = await hre.artifacts.readArtifact("MachineRegistry");
  const escrowArtifact = await hre.artifacts.readArtifact("JobEscrow");

  const abiDir = path.join(__dirname, "..", "integration", "abi");
  fs.mkdirSync(abiDir, { recursive: true });

  fs.writeFileSync(
    path.join(abiDir, "MachineRegistry.json"),
    JSON.stringify(registryArtifact.abi, null, 2)
  );
  fs.writeFileSync(
    path.join(abiDir, "JobEscrow.json"),
    JSON.stringify(escrowArtifact.abi, null, 2)
  );

  console.log(`[SUCCESS] ABIs written to ${abiDir}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
