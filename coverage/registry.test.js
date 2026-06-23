import test from "node:test";
import assert from "node:assert/strict";
import { resolveBrowser, supportedBrowsers } from "../src/browsers/registry.js";


test("supportedBrowsers lists zen", () => {
  assert.deepEqual(supportedBrowsers(), ["zen"]);
});

test("resolveBrowser uses zen by default", () => {
  const adapter = resolveBrowser();
  assert.equal(adapter.name, "zen");
  assert.equal(adapter.displayName, "Zen");
});

test("resolveBrowser rejects unsupported browsers", () => {
  assert.throws(
    () => resolveBrowser("unknown"),
    /Unsupported browser: unknown\. Supported browsers: zen\./,
  );
});
