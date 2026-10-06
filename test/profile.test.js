import test from "node:test";
import assert from "node:assert/strict";
import { baseUrl, validateProfile } from "../lib/profile.js";
import { renderWorkflow } from "../lib/install.js";
test("normalize endpoint with port", () =>
  assert.equal(
    baseUrl("gateway.example:8081/v1"),
    "https://gateway.example:8081/v1",
  ));
for (const url of [
  "ftp://example.com",
  "https://key@example.com",
  "https://example.com?key=x",
  "https://example.com#x",
])
  test(`deny unsafe endpoint ${url}`, () => assert.throws(() => baseUrl(url)));
test("no fixed model or credentials rendered", () => {
  const body = renderWorkflow({
    mode: "harness",
    profile: "pi",
    base: "https://gateway.example/v1",
    model: "my-model",
    key: "NEVER_COMMIT_ME",
  });
  assert.match(body, /openai\/my-model/);
  assert.match(body, /secrets.AGENT_API_KEY/);
  assert.doesNotMatch(
    body,
    /NEVER_COMMIT_ME|APP_PRIVATE_KEY|77\.110|arc-factory/,
  );
});
test("invalid profiles reject", () =>
  assert.throws(() =>
    validateProfile({ mode: "own", profile: "unknown", model: "x" }),
  ));
test("broker tokens remain job-local and consumers request OIDC", () => {
  const body = renderWorkflow(
    {
      mode: "harness",
      profile: "pi",
      base: "https://gateway.example",
      model: "x",
    },
    { brokerUrl: "https://broker.example" },
  );
  assert.match(
    body,
    /jobs:\n  safe_outputs:\n    permissions:\n      id-token: write\n    pre-steps:/,
  );
  assert.match(
    body,
    /github-token: \$\{\{ steps.factory_token.outputs.token \}\}/,
  );
});
