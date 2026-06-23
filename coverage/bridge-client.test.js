import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { BridgeUnavailableError, sendBridgeCommand } from "../src/bridge/client.js";

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ob-"));
}

function listen(server, socketPath) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("sendBridgeCommand writes a request and resolves the bridge result", { skip: process.platform === "win32" }, async () => {
  const originalHome = process.env.OPENBROWSER_HOME;
  const home = makeHome();
  const browser = `s${process.pid}`;
  const socketPath = path.join(home, "bridge", `${browser}.sock`);
  fs.mkdirSync(path.dirname(socketPath), { recursive: true });

  const server = net.createServer((socket) => {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (!buffer.includes("\n")) return;
      assert.deepEqual(JSON.parse(buffer.trim()), {
        command: "status",
        args: { verbose: true },
      });
      socket.end(`${JSON.stringify({ ok: true, result: { ready: true } })}\n`);
    });
  });

  process.env.OPENBROWSER_HOME = home;
  await listen(server, socketPath);

  try {
    const result = await sendBridgeCommand(browser, "status", { verbose: true }, { timeoutMs: 1_000 });
    assert.deepEqual(result, { ready: true });
  } finally {
    await close(server);
    fs.rmSync(home, { recursive: true, force: true });
    if (originalHome === undefined) delete process.env.OPENBROWSER_HOME;
    else process.env.OPENBROWSER_HOME = originalHome;
  }
});

test("sendBridgeCommand rejects bridge error responses with their code", { skip: process.platform === "win32" }, async () => {
  const originalHome = process.env.OPENBROWSER_HOME;
  const home = makeHome();
  const browser = `e${process.pid}`;
  const socketPath = path.join(home, "bridge", `${browser}.sock`);
  fs.mkdirSync(path.dirname(socketPath), { recursive: true });

  const server = net.createServer((socket) => {
    socket.on("data", () => {
      socket.end(`${JSON.stringify({ ok: false, error: { message: "No tab", code: "NO_TAB" } })}\n`);
    });
  });

  process.env.OPENBROWSER_HOME = home;
  await listen(server, socketPath);

  try {
    await assert.rejects(
      sendBridgeCommand(browser, "state", {}, { timeoutMs: 1_000 }),
      (error) => error.message === "No tab" && error.code === "NO_TAB",
    );
  } finally {
    await close(server);
    fs.rmSync(home, { recursive: true, force: true });
    if (originalHome === undefined) delete process.env.OPENBROWSER_HOME;
    else process.env.OPENBROWSER_HOME = originalHome;
  }
});

test("sendBridgeCommand rejects unavailable sockets with BridgeUnavailableError", { skip: process.platform === "win32" }, async () => {
  const originalHome = process.env.OPENBROWSER_HOME;
  const home = makeHome();
  process.env.OPENBROWSER_HOME = home;

  try {
    await assert.rejects(
      sendBridgeCommand(`m${process.pid}`, "status", {}, { timeoutMs: 1_000 }),
      BridgeUnavailableError,
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    if (originalHome === undefined) delete process.env.OPENBROWSER_HOME;
    else process.env.OPENBROWSER_HOME = originalHome;
  }
});
