#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(path.join(root, ".env"));

const sourceDir = path.join(root, "extensions");
const artifactsDir = path.join(root, "dist", "extensions", "firefox", "signed");
const bundledArtifact = path.join(root, "dist", "extensions", "firefox", "openbrowser.xpi");

if (!process.env.AMO_JWT_ISSUER || !process.env.AMO_JWT_SECRET) {
  throw new Error("Firefox signing requires AMO_JWT_ISSUER and AMO_JWT_SECRET.");
}

if (!fs.existsSync(path.join(sourceDir, "manifest.json"))) {
  throw new Error("Missing Firefox extension source manifest at ./extensions/manifest.json.");
}

await run(process.execPath, [path.join(root, "scripts", "build.js"), "firefox"]);

fs.rmSync(artifactsDir, { recursive: true, force: true });
fs.mkdirSync(artifactsDir, { recursive: true });

await run("npx", [
  "web-ext",
  "sign",
  "--source-dir", sourceDir,
  "--channel", "unlisted",
  "--api-key", process.env.AMO_JWT_ISSUER,
  "--api-secret", process.env.AMO_JWT_SECRET,
  "--artifacts-dir", artifactsDir,
], { stdio: "inherit" });

const signed = fs.readdirSync(artifactsDir)
  .filter((file) => file.endsWith(".xpi"))
  .map((file) => path.join(artifactsDir, file))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

if (!signed) throw new Error("web-ext did not produce a signed .xpi artifact.");
fs.copyFileSync(signed, bundledArtifact);
console.log(`Bundled signed Firefox artifact at ${path.relative(root, bundledArtifact)}`);

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: options.stdio || "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}
