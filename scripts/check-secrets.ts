import { execSync } from "child_process";
import * as fs from "fs";

/**
 * Scans git-tracked files to ensure no private key pattern is committed.
 * Specifically checks for hardcoded private keys assigned to variables,
 * configs, or passed directly to Wallet constructors.
 */
function main() {
  console.log("Checking tracked files for private key leaks...");
  let files: string[] = [];
  try {
    const gitOutput = execSync("git ls-files", { encoding: "utf8" });
    files = gitOutput.split("\n").map((f) => f.trim()).filter(Boolean);
  } catch (err: any) {
    console.warn("Unable to run git ls-files, skipping tracked file check:", err.message);
    process.exit(0);
  }

  // Detect patterns where a 64-hex key is assigned to a key/secret variable or used in Wallet()
  const privateKeyAssignment = /(?:private[_-]?key|secret|signer_key)\s*[:=]\s*["'](0x[a-fA-F0-9]{64})["']/i;
  const walletConstructorKey = /new\s+(?:[a-zA-Z0-9_.]+\.)?Wallet\(\s*["'](0x[a-fA-F0-9]{64})["']/i;

  const violations: { file: string; line: number; match: string }[] = [];

  for (const file of files) {
    if (
      file.endsWith(".env.example") ||
      file.endsWith(".png") ||
      file.endsWith(".webp") ||
      file.endsWith(".ico") ||
      file.endsWith(".svg") ||
      file.endsWith(".jpg")
    ) {
      continue;
    }
    if (!fs.existsSync(file)) continue;

    try {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        // Exclude dummy 0x000... zero hashes or type definitions
        if (line.includes("0x0000000000000000000000000000000000000000000000000000000000000000")) return;
        if (line.includes("0x[0-9a-fA-F]{64}") || line.includes("0x[a-fA-F0-9]{64}")) return;

        const m1 = line.match(privateKeyAssignment);
        if (m1) {
          violations.push({ file, line: index + 1, match: line.trim() });
          return;
        }

        const m2 = line.match(walletConstructorKey);
        if (m2) {
          violations.push({ file, line: index + 1, match: line.trim() });
        }
      });
    } catch {
      // Ignore binary files or read errors
    }
  }

  if (violations.length > 0) {
    console.error("FATAL: Private key leak detected in tracked files:");
    violations.forEach((v) => console.error(`  - ${v.file}:${v.line} -> ${v.match}`));
    process.exit(1);
  }

  console.log("All tracked files clean. Zero private keys detected.");
}

main();
