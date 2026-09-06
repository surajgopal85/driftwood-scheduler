// Fresh database from data/facility.json + rules/v0.1.json + the PTO CSV if present.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { upsertFacility } from "../src/db/repo";

const facility = JSON.parse(fs.readFileSync("data/facility.json", "utf8"));
upsertFacility(facility);
console.log(`facility: ${facility.workers.length} workers, ${facility.shifts.length} shifts`);
execFileSync("npx", ["tsx", "scripts/rules-apply.ts", "rules/v0.1.json"], { stdio: "inherit" });
if (fs.existsSync("data/pto.csv")) execFileSync("npx", ["tsx", "scripts/import-pto.ts", "data/pto.csv"], { stdio: "inherit" });
