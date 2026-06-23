#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import yazl from "yazl";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] || "firefox";

if (target !== "firefox") {
  throw new Error(`Unsupported build target: ${target}`);
}

const sourceDir = path.join(root, "extensions");
const buildDir = path.join(root, "build", "firefox-extension");
const outDir = path.join(root, "dist", "extensions", "firefox");
const outFile = path.join(outDir, "openbrowser-dev.xpi");

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

copyFile(path.join(sourceDir, "manifest.json"), path.join(buildDir, "manifest.json"));
copyFile(path.join(sourceDir, "background.js"), path.join(buildDir, "background.js"));
copyFile(path.join(sourceDir, "content.js"), path.join(buildDir, "content.js"));
copyDirectory(path.join(sourceDir, "assets"), path.join(buildDir, "assets"));

await zipDirectory(buildDir, outFile);
console.log(`Built ${path.relative(root, outFile)}`);

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDirectory(from, to) {
  if (!fs.existsSync(from)) return;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);
    if (entry.isDirectory()) copyDirectory(source, destination);
    else copyFile(source, destination);
  }
}

function zipDirectory(directory, destination) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const output = fs.createWriteStream(destination);

    output.on("close", resolve);
    output.on("error", reject);
    zip.outputStream.on("error", reject);
    zip.outputStream.pipe(output);

    for (const file of listFiles(directory)) {
      zip.addFile(file, path.relative(directory, file).replace(/\\/g, "/"));
    }
    zip.end();
  });
}

function listFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(full));
    else result.push(full);
  }
  return result;
}
