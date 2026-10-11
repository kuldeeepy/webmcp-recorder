// Builds dist/ and zips it for the Chrome Web Store: release/webmcp-recorder-<version>.zip
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync } from "node:fs";

execFileSync("node", ["scripts/build.mjs"], { stdio: "inherit" });
const { version } = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
const zip = `release/webmcp-recorder-${version}.zip`;
mkdirSync("release", { recursive: true });
rmSync(zip, { force: true });
execFileSync("zip", ["-r", "-X", "-q", `../${zip}`, ".", "-x", "*.DS_Store"], { cwd: "dist" });
console.log(`Packaged ${zip}`);
