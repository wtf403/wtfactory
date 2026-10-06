import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, install } from "../lib/install.js";
test("setup handles non-main default, reuses PR and avoids empty commits; failed compile never pushes", async () => {
  const root = mkdtempSync(join(tmpdir(), "factory-test-"));
  const old = process.env.PATH;
  try {
    const remote = join(root, "remote.git"),
      seed = join(root, "seed"),
      bin = join(root, "bin"),
      state = join(root, "state.json");
    mkdirSync(bin);
    run("git", ["init", "--bare", remote]);
    run("git", ["init", "-b", "trunk", seed]);
    writeFileSync(join(seed, "README.md"), "sample");
    run("git", ["add", "."], seed);
    run(
      "git",
      [
        "-c",
        "user.name=test",
        "-c",
        "user.email=test@local",
        "commit",
        "-m",
        "seed",
      ],
      seed,
    );
    run("git", ["remote", "add", "origin", remote], seed);
    run("git", ["push", "origin", "trunk"], seed);
    run("git", ["symbolic-ref", "HEAD", "refs/heads/trunk"], remote);
    writeFileSync(state, JSON.stringify({ created: 0, edited: 0, vars: [] }));
    writeFileSync(
      join(bin, "gh"),
      `#!/usr/bin/env node\nconst fs=require('fs'),cp=require('child_process');const a=process.argv.slice(2);const state=${JSON.stringify(state)},remote=${JSON.stringify(remote)};let s=JSON.parse(fs.readFileSync(state));if(a[0]==='repo'&&a[1]==='clone'){let r=cp.spawnSync('git',['clone',remote,a[3]],{encoding:'utf8'});process.stderr.write(r.stderr||'');process.exit(r.status);}else if(a[0]==='repo'&&a[1]==='view')console.log(JSON.stringify({defaultBranchRef:{name:'trunk'}}));else if(a[0]==='aw')fs.writeFileSync('.github/workflows/factory.lock.yml','compiled deterministic');else if(a[0]==='pr'&&a[1]==='list')console.log(JSON.stringify(s.created && !(s.merged && a.includes('open'))?[{number:1,url:'https://github.com/owner/repo/pull/1'}]:[]));else if(a[0]==='pr'&&a[1]==='create'){s.created++;s.base=a[a.indexOf('--base')+1];console.log('https://github.com/owner/repo/pull/1');}else if(a[0]==='pr'&&a[1]==='edit')s.edited++;else if(a[0]==='variable')s.vars.push(a[2]);else process.exit(1);fs.writeFileSync(state,JSON.stringify(s));`,
      { mode: 0o755 },
    );
    process.env.PATH = bin + ":" + old;
    const opts = {
      repo: "owner/repo",
      board: async () => ({ url: "https://github.com/users/owner/projects/1" }),
      profile: {
        mode: "harness",
        profile: "pi",
        base: "https://provider.example",
        model: "configured-model",
      },
    };
    await assert.rejects(
      () =>
        install({
          ...opts,
          board: async () => {
            throw new Error("NEED_PROJECT_SCOPE");
          },
        }),
      /NEED_PROJECT_SCOPE/,
    );
    assert.equal(
      run("git", ["ls-remote", remote, "refs/heads/factory/setup"]),
      "",
    );
    assert.equal(JSON.parse(readFileSync(state)).created, 0);
    assert.deepEqual(JSON.parse(readFileSync(state)).vars, []);
    const first = await install(opts);
    const sha = run("git", ["rev-parse", "refs/heads/factory/setup"], remote);
    const second = await install(opts);
    assert.equal(first.url, second.url);
    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.equal(
      sha,
      run("git", ["rev-parse", "refs/heads/factory/setup"], remote),
    );
    const s = JSON.parse(readFileSync(state));
    assert.equal(s.created, 1);
    assert.equal(s.edited, 1);
    assert.equal(s.base, "trunk");
    run("git", ["update-ref", "refs/heads/trunk", sha], remote);
    s.merged = true;
    writeFileSync(state, JSON.stringify(s));
    const mergedRun = await install(opts);
    assert.equal(mergedRun.url, first.url);
    assert.equal(JSON.parse(readFileSync(state)).created, 1);
    assert.ok(s.vars.includes("AGENT_MODEL"));
    await assert.rejects(
      () =>
        install({
          ...opts,
          profile: { ...opts.profile, model: "changed" },
          compile: () => {
            throw new Error("compile failed");
          },
        }),
      /compile failed/,
    );
    assert.equal(
      sha,
      run("git", ["rev-parse", "refs/heads/factory/setup"], remote),
    );
  } finally {
    process.env.PATH = old;
    rmSync(root, { recursive: true, force: true });
  }
});
test("dry run renders without GitHub or Projects mutations", async () => {
  const result = await install({
    repo: "owner/repo",
    profile: {
      mode: "harness",
      profile: "pi",
      base: "https://provider.example",
      model: "x",
    },
    dry: true,
  });
  assert.equal(result.dry, true);
  assert.equal(result.branch, "factory/setup");
});
