import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { brokerStep } from "../lib/broker-step.js";
test("generated hook requests the audience, masks token, and writes a real newline to GITHUB_OUTPUT", () => {
  const root = mkdtempSync(join(tmpdir(), "factory-hook-"));
  try {
    const output = join(root, "output");
    const script = brokerStep("https://broker.example")
      .split("<<'NODE'\n")[1]
      .split("\n          NODE")[0]
      .replace(/^          /gm, "");
    const stub = `let calls=0;globalThis.fetch=async(u,o)=>{calls++;if(calls===1){if(new URL(u).searchParams.get('audience')!=='https://broker.example')throw Error('audience');if(o.headers.Authorization!=='Bearer request-credential')throw Error('OIDC header');return {ok:true,json:async()=>({value:'signed-oidc'})};}if(u!=='https://broker.example/token'||o.headers.Authorization!=='Bearer signed-oidc')throw Error('broker header');return {ok:true,json:async()=>({token:'ghs_testvalue'})};};\n`;
    const result = spawnSync(process.execPath, ["--input-type=module"], {
      input: stub + script,
      encoding: "utf8",
      env: {
        ...process.env,
        FACTORY_BROKER_URL: "https://broker.example",
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://oidc.example/request",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-credential",
        GITHUB_OUTPUT: output,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(output, "utf8"), "token=ghs_testvalue\n");
    assert.match(result.stdout, /::add-mask::ghs_testvalue/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
