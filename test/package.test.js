import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("npm package contains installer assets but excludes broker and test fixtures", () => {
  const r = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  const names = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  assert.ok(names.includes("lib/install.js"));
  assert.ok(names.includes("lib/broker-step.js"));
  assert.ok(names.includes("bin/wtfactory.js"));
  assert.ok(
    names.every(
      (n) =>
        !n.startsWith("broker/") &&
        !n.startsWith("test/") &&
        !n.endsWith(".pem") &&
        !n.includes(".env"),
    ),
  );
});
