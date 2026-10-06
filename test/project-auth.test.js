import test from "node:test";
import assert from "node:assert/strict";
import { installWithProjectAuthorization } from "../lib/project-auth.js";
test("interactive missing Projects scope authorizes directly with GitHub and resumes once", async () => {
  let attempts = 0,
    authorizations = 0;
  const result = await installWithProjectAuthorization(
    { repo: "owner/repo" },
    {
      interactive: true,
      externalToken: false,
      installer: async () => {
        if (++attempts === 1) throw Error("NEED_PROJECT_SCOPE");
        return { complete: true };
      },
      authorize: async () => {
        authorizations++;
      },
    },
  );
  assert.equal(result.complete, true);
  assert.equal(attempts, 2);
  assert.equal(authorizations, 1);
});
for (const config of [
  { interactive: false, externalToken: false },
  { interactive: true, externalToken: true },
])
  test(`no silent refresh for noninteractive or externally supplied token ${JSON.stringify(config)}`, async () => {
    let called = false;
    await assert.rejects(
      () =>
        installWithProjectAuthorization(
          {},
          {
            ...config,
            installer: async () => {
              throw Error("NEED_PROJECT_SCOPE");
            },
            authorize: async () => {
              called = true;
            },
          },
        ),
      /NEED_PROJECT_SCOPE/,
    );
    assert.equal(called, false);
  });
test("authorization failure cannot be reported as installed", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      installWithProjectAuthorization(
        {},
        {
          interactive: true,
          externalToken: false,
          installer: async () => {
            calls++;
            throw Error("NEED_PROJECT_SCOPE");
          },
          authorize: async () => {
            throw Error("authorization cancelled");
          },
        },
      ),
    /cancelled/,
  );
  assert.equal(calls, 1);
});
