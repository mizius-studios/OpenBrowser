import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAME } from "../constants.js";

export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function openBrowserHome() {
  return process.env.OPENBROWSER_HOME || path.join(os.homedir(), APP_NAME);
}

export function screenshotsDir() {
  return path.join(openBrowserHome(), "screenshots");
}

export function bridgeSocketPath(browser) {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\openbrowser-${browser}`;
  }

  return path.join(openBrowserHome(), "bridge", `${browser}.sock`);
}
