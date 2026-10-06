import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT, jwtVerify, exportPKCS8 } from "jose";
import { createHandler, mintToken, verifyOidc } from "../src/worker.js";
test("signed OIDC issuer audience expiry and signature verification failures are denied", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const env = {
    APP_ID: "1",
    APP_PRIVATE_KEY: "unused",
    OIDC_AUDIENCE: "https://broker.example",
    REPOSITORY_POLICIES: "{}",
  };
  const h = createHandler(
    async (token) => verifyOidc(token, env.OIDC_AUDIENCE, publicKey),
    () => {
      throw new Error("must never mint");
    },
  );
  for (const settings of [
    { iss: "wrong", aud: env.OIDC_AUDIENCE, key: privateKey, exp: "5m" },
    {
      iss: "https://token.actions.githubusercontent.com",
      aud: "wrong",
      key: privateKey,
      exp: "5m",
    },
    {
      iss: "https://token.actions.githubusercontent.com",
      aud: env.OIDC_AUDIENCE,
      key: other.privateKey,
      exp: "5m",
    },
    {
      iss: "https://token.actions.githubusercontent.com",
      aud: env.OIDC_AUDIENCE,
      key: privateKey,
      exp: 1,
    },
  ]) {
    const token = await new SignJWT({
      sub: "repo:owner/repo:ref:refs/heads/main",
      repository: "owner/repo",
      repository_id: "123",
      repository_owner_id: "456",
      workflow_ref:
        "owner/repo/.github/workflows/factory.lock.yml@refs/heads/main",
      ref: "refs/heads/main",
      event_name: "workflow_dispatch",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(settings.iss)
      .setAudience(settings.aud)
      .setIssuedAt()
      .setExpirationTime(settings.exp)
      .sign(settings.key);
    const r = await h(
      new Request("https://broker.example/token", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      }),
      env,
    );
    assert.equal(r.status, 401);
  }
});
test("wrong installation cannot mint token", async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const env = { APP_ID: "1", APP_PRIVATE_KEY: await exportPKCS8(privateKey) };
  let calls = 0;
  await assert.rejects(() =>
    mintToken(
      { repository: "owner/repo" },
      { repositoryId: "123", ownerId: "456", installationId: "789" },
      env,
      async () => {
        calls++;
        return Response.json({ id: 999, account: { id: 456 } });
      },
    ),
  );
  assert.equal(calls, 1);
});
test("valid signed enrolled OIDC reaches mint only after verification", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const repository = "owner/repo",
    ref = "refs/heads/main",
    aud = "https://broker.example";
  const token = await new SignJWT({
    repository,
    repository_id: "123",
    repository_owner_id: "456",
    workflow_ref: `${repository}/.github/workflows/factory.lock.yml@${ref}`,
    ref,
    ref_type: "branch",
    event_name: "workflow_dispatch",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer("https://token.actions.githubusercontent.com")
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setSubject(`repo:${repository}:ref:${ref}`)
    .sign(privateKey);
  let called = 0;
  const h = createHandler(
    (t) => verifyOidc(t, aud, publicKey),
    async () => {
      called++;
      return { token: "mock-short-lived", expires_at: "mock" };
    },
  );
  const r = await h(
    new Request(aud + "/token", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    }),
    {
      APP_ID: "1",
      APP_PRIVATE_KEY: "unused",
      OIDC_AUDIENCE: aud,
      REPOSITORY_POLICIES: JSON.stringify({
        [repository]: {
          repositoryId: "123",
          ownerId: "456",
          installationId: "789",
          ref,
        },
      }),
    },
  );
  assert.equal(r.status, 200);
  assert.equal(called, 1);
});
