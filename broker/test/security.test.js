import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportPKCS8 } from "jose";
import { authorizeClaims, createHandler, mintToken } from "../src/worker.js";
const now = Math.floor(Date.now() / 1000);
const policies = {
  "owner/repo": {
    repositoryId: "123",
    ownerId: "456",
    installationId: "789",
    ref: "refs/heads/main",
  },
};
const claims = {
  iss: "https://token.actions.githubusercontent.com",
  aud: "https://broker.example",
  iat: now,
  exp: now + 300,
  repository: "owner/repo",
  repository_id: "123",
  repository_owner_id: "456",
  ref: "refs/heads/main",
  ref_type: "branch",
  workflow_ref: "owner/repo/.github/workflows/factory.lock.yml@refs/heads/main",
  sub: "repo:owner/repo:ref:refs/heads/main",
  event_name: "workflow_dispatch",
};
test("accept enrolled main workflow identity", () =>
  assert.deepEqual(
    authorizeClaims(claims, policies, claims.aud),
    policies["owner/repo"],
  ));
test("accept new immutable GitHub subject only with enrolled owner and repository IDs", () => {
  const sub = "repo:owner@456/repo@123:ref:refs/heads/main";
  assert.deepEqual(
    authorizeClaims({ ...claims, sub }, policies, claims.aud),
    policies["owner/repo"],
  );
  for (const bad of [
    "repo:owner@999/repo@123:ref:refs/heads/main",
    "repo:owner@456/repo@999:ref:refs/heads/main",
    "repo:owner@456/repo@123:pull_request",
    "repo:owner@456/repo@123:ref:refs/heads/evil",
  ])
    assert.throws(() =>
      authorizeClaims({ ...claims, sub: bad }, policies, claims.aud),
    );
});
for (const [name, value] of Object.entries({
  iss: "evil",
  aud: "evil",
  exp: now - 1,
  iat: now + 60,
  repository: "fork/repo",
  repository_id: "999",
  repository_owner_id: "999",
  ref: "refs/heads/factory/setup",
  ref_type: "tag",
  workflow_ref: "owner/repo/.github/workflows/evil.yml@refs/heads/main",
  sub: "repo:owner/repo:pull_request",
  event_name: "pull_request",
  job_workflow_ref: "evil/repo/workflow@main",
}))
  test(`deny invalid ${name}`, () =>
    assert.throws(() =>
      authorizeClaims({ ...claims, [name]: value }, policies, claims.aud),
    ));
test("verification denial never mints and returns no credential", async () => {
  let calls = 0;
  const h = createHandler(
    async () => {
      throw new Error("signature invalid");
    },
    async () => {
      calls++;
    },
  );
  const r = await h(
    new Request("https://broker.example/token", {
      method: "POST",
      headers: { Authorization: "Bearer bad" },
    }),
    {
      APP_ID: "1",
      APP_PRIVATE_KEY: "secret",
      OIDC_AUDIENCE: claims.aud,
      REPOSITORY_POLICIES: JSON.stringify(policies),
    },
  );
  assert.equal(r.status, 401);
  assert.equal(calls, 0);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(await r.text(), '{"error":"unauthorized"}');
});
test("mint verifies installation and requests only enrolled repository permissions", async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const key = await exportPKCS8(privateKey);
  let calls = [];
  const fetcher = async (url, opts) => {
    calls.push({ url, opts });
    return Response.json(
      calls.length === 1
        ? { id: 789, account: { id: 456 }, suspended_at: null }
        : { token: "test", expires_at: "later" },
    );
  };
  await mintToken(
    claims,
    policies["owner/repo"],
    { APP_ID: "1", APP_PRIVATE_KEY: key },
    fetcher,
  );
  const body = JSON.parse(calls[1].opts.body);
  assert.deepEqual(body, {
    repository_ids: [123],
    permissions: { contents: "write", issues: "write", pull_requests: "write" },
  });
});
