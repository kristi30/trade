import { execSync } from "node:child_process";
import fs from "node:fs";

const run = (command) => {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit" });
};

if (process.platform !== "darwin") {
  console.error("This iOS setup must be run on macOS.");
  process.exit(1);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 22) {
  console.error(`Node.js 22+ is required. Current version: ${process.versions.node}`);
  process.exit(1);
}

try {
  execSync("xcode-select -p", { stdio: "ignore" });
} catch {
  console.error("Xcode Command Line Tools are not configured. Install Xcode, then run: xcode-select --install");
  process.exit(1);
}

console.log("\nBlindSpark iPhone setup\n");
console.log("Installing dependencies, creating/syncing the Capacitor iOS project, adding privacy strings, and opening Xcode.");

run("npm install");
run("npm run build:web");

if (!fs.existsSync("ios/App")) {
  run("npx cap add ios");
} else {
  console.log("\n✓ Existing iOS project found; keeping it.");
}

run("npx cap sync ios");
run("node scripts/patch-ios.mjs");
run("npx cap open ios");

console.log("\n✓ Xcode should now be open.");
console.log("Select your iPhone, choose your Apple Account team under Signing & Capabilities, then press Run.");
