import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { bridgeSocketPath, openBrowserHome, screenshotsDir } from "../src/util/paths.js";

const originalHome = process.env.OPENBROWSER_HOME;

test.after(() => {
  if (originalHome === undefined) delete process.env.OPENBROWSER_HOME;
  else process.env.OPENBROWSER_HOME = originalHome;
});

test("openBrowserHome honors OPENBROWSER_HOME", () => {
  const home = path.join(os.tmpdir(), "openbrowser-test-home");
  process.env.OPENBROWSER_HOME = home;

  assert.equal(openBrowserHome(), home);
  assert.equal(screenshotsDir(), path.join(home, "screenshots"));
});

test("bridgeSocketPath points inside the OpenBrowser bridge directory", () => {
  const home = path.join(os.tmpdir(), "openbrowser-test-home");
  process.env.OPENBROWSER_HOME = home;

  if (process.platform === "win32") {
    assert.equal(bridgeSocketPath("zen"), "\\\\.\\pipe\\openbrowser-zen");
    return;
  }

  assert.equal(bridgeSocketPath("zen"), path.join(home, "bridge", "zen.sock"));
});
