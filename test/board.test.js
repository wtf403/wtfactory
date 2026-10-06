import test from "node:test";
import assert from "node:assert/strict";
import { createBoard, STATUSES } from "../lib/board.js";
for (const type of ["User", "Organization"]) {
  test(`fresh ${type} project is created under repo owner, linked, and reused`, async () => {
    const calls = [];
    const fields = [
      { id: "status", name: "Status", options: [{ name: "Todo" }] },
    ];
    let project;
    const kind = type === "User" ? "user" : "organization";
    const query = (q, v) => {
      calls.push({ q, v });
      if (q.includes("repositoryOwner"))
        return {
          repositoryOwner: { id: "owner-id", login: "owner", __typename: type },
        };
      if (q.includes("projectsV2(first:100")) {
        assert.ok(q.includes(`${kind}(login:`));
        return {
          [kind]: {
            projectsV2: {
              nodes: project ? [project] : [],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
      }
      if (q.includes("createProjectV2(")) {
        assert.equal(v.owner, "owner-id");
        project = {
          id: "project",
          title: v.title,
          url: `https://github.com/${type === "User" ? "users" : "orgs"}/owner/projects/1`,
        };
        return { createProjectV2: { projectV2: project } };
      }
      if (q.includes("fields(first:100)"))
        return {
          node: { fields: { nodes: fields }, items: { totalCount: 0 } },
        };
      if (q.includes("updateProjectV2Field")) {
        fields[0].options = v.input.singleSelectOptions;
        return {};
      }
      if (q.includes("createProjectV2Field")) {
        fields.push({
          ...v.input,
          id: v.input.name,
          options: v.input.singleSelectOptions,
        });
        return {};
      }
      if (q.includes("repository(owner:")) {
        assert.deepEqual(v, { owner: "owner", name: "repo" });
        return { repository: { id: "repository" } };
      }
      if (q.includes("linkProjectV2ToRepository")) return {};
      throw Error(q);
    };
    const args = {
      owner: "owner",
      repo: "owner/repo",
      title: "Factory: owner/repo",
    };
    const first = await createBoard(args, query);
    assert.equal(first.ownerType, kind);
    assert.equal(
      calls.filter((c) => c.q.includes("createProjectV2(")).length,
      1,
    );
    assert.ok(
      !calls.some(
        (c) =>
          c.q.includes("createProjectV2Field") && c.v.input.name === "Status",
      ),
    );
    assert.deepEqual(
      fields[0].options.map((o) => o.name),
      STATUSES,
    );
    for (const c of calls.filter((c) => c.v.input?.singleSelectOptions))
      assert.ok(
        c.v.input.singleSelectOptions.every(
          (o) =>
            typeof o.name === "string" &&
            o.color === "GRAY" &&
            o.description === "",
        ),
      );
    assert.deepEqual(calls.at(-1).v, {
      project: "project",
      repository: "repository",
    });
    calls.length = 0;
    const second = await createBoard(args, query);
    assert.equal(first.url, second.url);
    assert.ok(
      !calls.some((c) =>
        /createProjectV2\(|createProjectV2Field|updateProjectV2Field/.test(c.q),
      ),
    );
  });
}
test("missing Projects authorization stops before any mutation", async () => {
  const calls = [];
  await assert.rejects(
    () =>
      createBoard({ owner: "owner" }, (q) => {
        calls.push(q);
        if (q.includes("repositoryOwner"))
          return { repositoryOwner: { id: "id", __typename: "User" } };
        throw Error("NEED_PROJECT_SCOPE");
      }),
    /NEED_PROJECT_SCOPE/,
  );
  assert.equal(calls.length, 2);
  assert.ok(!calls.some((q) => q.startsWith("mutation")));
});
