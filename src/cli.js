import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveBrowser, supportedBrowsers } from "./browsers/registry.js";
import { BridgeUnavailableError, sendBridgeCommandWithRetry } from "./bridge/client.js";
import { screenshotsDir } from "./util/paths.js";

export async function runCli(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const parsed = parseGlobalOptions(argv);
  const [command, ...positionals] = parsed.positionals;
  const adapter = resolveBrowser(parsed.browser);

  if (command === "install") {
    const browserName = positionals[0] || parsed.browser;
    if (!browserName) throw new Error(`Usage: OpenBrowser install <browser>`);
    const installAdapter = resolveBrowser(browserName);
    const result = await installAdapter.install();
    console.error(result.note);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const request = toBridgeRequest(command, positionals, parsed.flags);
  if (!request) throw new Error(`Unknown command: ${command}`);

  const result = await sendCommandEnsuringBridge(adapter, request.command, request.args, request.timeoutMs);
  await printResult(request, result);
}

async function sendCommandEnsuringBridge(adapter, command, args, timeoutMs) {
  try {
    return await sendBridgeCommandWithRetry(adapter.name, command, args, { timeoutMs });
  } catch (error) {
    if (!(error instanceof BridgeUnavailableError)) throw error;
    await adapter.launch();
    return sendBridgeCommandWithRetry(adapter.name, command, args, {
      timeoutMs,
      attempts: 12,
      delayMs: 500,
    });
  }
}

function parseGlobalOptions(argv) {
  const flags = new Map();
  const positionals = [];
  let browser;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--browser") {
      browser = requireValue(argv, ++i, "--browser");
      continue;
    }
    if (token.startsWith("--browser=")) {
      browser = token.slice("--browser=".length);
      continue;
    }
    if (token.startsWith("--")) {
      const [name, inlineValue] = token.slice(2).split("=", 2);
      if (inlineValue !== undefined) flags.set(name, inlineValue);
      else if (isValueFlag(name)) flags.set(name, requireValue(argv, ++i, `--${name}`));
      else flags.set(name, true);
      continue;
    }
    positionals.push(token);
  }

  return { browser, flags, positionals };
}

function isValueFlag(name) {
  return new Set(["ref", "to"]).has(name);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}.`);
  return value;
}

function toBridgeRequest(command, args, flags) {
  switch (command) {
    case "open":
      return requireArgs(command, args, 1, { command, args: { url: args[0] } });
    case "close":
    case "status":
    case "reload":
    case "back":
    case "forward":
    case "state":
      return { command, args: {} };
    case "navigate":
      return requireArgs(command, args, 1, { command, args: { url: args[0] } });
    case "screenshot":
      return { command, args: { base64: Boolean(flags.get("base64")) }, timeoutMs: 45_000 };
    case "click":
      return requireArgs(command, args, 1, { command, args: { ref: args[0] } });
    case "keys":
      return requireArgs(command, args, 1, { command, args: { text: args.join(" ") } });
    case "press":
      return requireArgs(command, args, 1, { command, args: { key: args[0] } });
    case "select":
      return requireArgs(command, args, 2, { command, args: { ref: args[0], option: args[1] } });
    case "get":
      if (!flags.get("html")) throw new Error("Only get --html is currently supported.");
      return { command: "getHtml", args: { ref: flags.get("ref") || null } };
    case "scroll":
      if (flags.get("to")) return { command, args: { to: flags.get("to") } };
      if (!["up", "down"].includes(args[0])) {
        throw new Error("Usage: OpenBrowser scroll up|down [pixels] or OpenBrowser scroll --to <ref>");
      }
      return { command, args: { direction: args[0], pixels: Number(args[1] || 600) } };
    default:
      return null;
  }
}

function requireArgs(name, args, count, request) {
  if (args.length < count) throw new Error(`Missing argument for ${name}.`);
  return request;
}

async function printResult(request, result) {
  if (request.command === "screenshot") {
    const base64 = normalizeBase64(result.dataUrl || result.base64 || "");
    if (request.args.base64) {
      process.stdout.write(`${base64}\n`);
      return;
    }

    const dir = screenshotsDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${crypto.randomBytes(4).toString("hex")}.png`);
    fs.writeFileSync(file, Buffer.from(base64, "base64"));
    process.stdout.write(`${file}\n`);
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

function normalizeBase64(value) {
  const comma = value.indexOf(",");
  return comma === -1 ? value : value.slice(comma + 1);
}

function printHelp() {
  console.log(`OpenBrowser\n\nUsage:\n  OpenBrowser install <browser>\n  OpenBrowser open <url> [--browser zen]\n  OpenBrowser close [--browser zen]\n  OpenBrowser status [--browser zen]\n  OpenBrowser navigate <url> [--browser zen]\n  OpenBrowser reload|back|forward [--browser zen]\n  OpenBrowser state [--browser zen]\n  OpenBrowser screenshot [--base64] [--browser zen]\n  OpenBrowser click <ref> [--browser zen]\n  OpenBrowser keys <text> [--browser zen]\n  OpenBrowser press <key> [--browser zen]\n  OpenBrowser select <ref> <option> [--browser zen]\n  OpenBrowser get --html [--ref <ref>] [--browser zen]\n  OpenBrowser scroll up|down [pixels] [--browser zen]\n  OpenBrowser scroll --to <ref> [--browser zen]\n\nSupported browsers: ${supportedBrowsers().join(", ")}`);
}
