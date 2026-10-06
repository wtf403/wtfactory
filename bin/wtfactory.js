#!/usr/bin/env node
import * as s from "@clack/prompts";
import { preflight } from "../lib/setup.js";
import { detectRepo } from "../lib/install.js";
import { installWithProjectAuthorization } from "../lib/project-auth.js";
import { readFileSync } from "node:fs";
const version = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url)),
).version;
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const ask = async (message, initialValue) => {
  const v = await s.text({ message, initialValue });
  if (s.isCancel(v)) process.exit(130);
  return v;
};
try {
  if (args.includes("--version")) {
    console.log(version);
    process.exit(0);
  }
  if (args.includes("--help")) {
    console.log(
      "npx wtfactory [--repo OWNER/REPO] [--dry-run]\nNoninteractive: AGENT_MODE, AGENT_PROFILE, AGENT_BASE_URL, AGENT_MODEL, AGENT_API_KEY, FACTORY_BROKER_URL, PROJECT_URL",
    );
    process.exit(0);
  }
  if (["board", "arc", "doctor", "init"].includes(args[0])) {
    await import("../lib/advanced.js");
    process.exit(0);
  }
  s.intro(`wtfactory ${version}`);
  const missing = preflight();
  if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);
  const repo =
    flag("repo") ||
    process.env.FACTORY_REPO ||
    detectRepo() ||
    (await ask("GitHub repository OWNER/REPO"));
  s.log.message(`Repository: ${repo}`);
  const mode =
    process.env.AGENT_MODE ||
    (await s.select({
      message: "Agent setup",
      options: [
        {
          value: "harness",
          label: "Preconfigured harness (Pi, OpenAI-compatible provider)",
        },
        {
          value: "own",
          label: "User-owned agent (repository skills and plugins)",
        },
      ],
    }));
  if (s.isCancel(mode)) process.exit(130);
  const profile =
    process.env.AGENT_PROFILE ||
    (mode === "harness"
      ? "pi"
      : await s.select({
          message: "Agent runtime",
          options: ["codex", "claude", "gemini", "pi"].map((value) => ({
            value,
            label: value,
          })),
        }));
  if (s.isCancel(profile)) process.exit(130);
  const base =
    process.env.AGENT_BASE_URL ||
    (mode === "harness" ? await ask("Provider API endpoint") : "");
  const model = process.env.AGENT_MODEL || (await ask("Model ID"));
  const dry = args.includes("--dry-run");
  let key = process.env.AGENT_API_KEY;
  if (!dry && key === undefined) {
    key = await s.password({
      message:
        "Provider API key (leave empty to retain existing AGENT_API_KEY)",
    });
    if (s.isCancel(key)) process.exit(130);
  }
  const result = await installWithProjectAuthorization({
    repo,
    profile: { mode, profile, base, model, key },
    brokerUrl:
      process.env.FACTORY_BROKER_URL ||
      "https://wtfactory-token-broker.wtf403.workers.dev",
    projectUrl: process.env.PROJECT_URL,
    dry,
    skipProjects: args.includes("--skip-projects"),
  });
  s.outro(
    dry
      ? `Dry run: ${repo}, factory/setup, ${mode}/${profile}`
      : `${result.complete ? `Board linked: ${result.projectUrl}. ` : "DIAGNOSTIC ONLY: Projects skipped. "}${result.changed ? "Updated" : "Reused"} ${result.url}. Review and merge; dispatch an issue after provider authentication and broker enrollment are configured.`,
  );
} catch (e) {
  s.log.error(
    e.message === "NEED_PROJECT_SCOPE"
      ? "Projects setup blocked: run gh auth refresh -s project,read:project, then rerun. No complete installation was performed."
      : e.message,
  );
  process.exitCode = 1;
}
