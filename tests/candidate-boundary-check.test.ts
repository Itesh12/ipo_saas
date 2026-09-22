import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "child_process";

describe("Candidate A-E Architectural Boundary Machine Verification", () => {
  const BASELINE_COMMIT = "fbc0470";

  const PROTECTED_PREFIXES = [
    "features/finance/",
    "features/application/",
    "features/allotment/",
    "features/settlement/",
    "features/portfolio/",
    "features/portfolio-exit/",
    "supabase/migrations/20260928000034_",
    "supabase/migrations/20260928000035_",
  ];

  test("1. Machine Gate: No modified files in sealed Candidate A-E paths relative to baseline fbc0470", () => {
    let diffOutput = "";
    try {
      diffOutput = execSync(`git diff --name-only ${BASELINE_COMMIT}`, {
        encoding: "utf-8",
      });
    } catch (err) {
      assert.fail(`Failed to execute git diff against baseline ${BASELINE_COMMIT}: ${err}`);
    }

    const changedFiles = diffOutput
      .split("\n")
      .map((f) => f.trim().replace(/\\/g, "/"))
      .filter((f) => f.length > 0);

    const violations: string[] = [];

    for (const file of changedFiles) {
      for (const prefix of PROTECTED_PREFIXES) {
        if (file.startsWith(prefix)) {
          violations.push(file);
        }
      }
    }

    assert.equal(
      violations.length,
      0,
      `VIOLATION of Hard Architectural Boundary! Protected files modified relative to ${BASELINE_COMMIT}:\n${violations.join("\n")}`
    );
  });
});
