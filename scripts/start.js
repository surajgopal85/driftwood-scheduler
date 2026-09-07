// Production start script: seeds the DB if it doesn't exist, then starts Next.js.
const fs = require("node:fs");
const path = require("node:path");
const { execSync, execFileSync } = require("node:child_process");

const dbPath = process.env.RVS_DB || path.join(process.cwd(), "data", "rvs.db");

// Ensure the directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

if (!fs.existsSync(dbPath)) {
  console.log(`No database at ${dbPath} — seeding...`);
  execSync("node --import tsx scripts/seed.ts", { stdio: "inherit", cwd: process.cwd() });
  console.log("Seed complete.");
} else {
  console.log(`Database exists at ${dbPath}`);
}

// Start Next.js
const port = process.env.PORT || "3000";
console.log(`Starting on port ${port}`);
execFileSync("node_modules/.bin/next", ["start", "-p", port], { stdio: "inherit", cwd: process.cwd() });
