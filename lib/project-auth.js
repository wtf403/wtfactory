import { spawn } from "node:child_process";
import { install } from "./install.js";

export function refreshProjectAuthorization() {
  console.error(
    "GitHub Projects authorization is required. Complete the GitHub device authorization shown below; setup will resume automatically.",
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      "gh",
      ["auth", "refresh", "-h", "github.com", "-s", "project,read:project"],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Projects authorization was not completed. Run gh auth refresh -s project,read:project and rerun setup.",
            ),
          ),
    );
  });
}

export async function installWithProjectAuthorization(
  options,
  {
    interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
    externalToken = Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN),
    installer = install,
    authorize = refreshProjectAuthorization,
  } = {},
) {
  try {
    return await installer(options);
  } catch (e) {
    if (e.message !== "NEED_PROJECT_SCOPE" || !interactive || externalToken)
      throw e;
    await authorize();
    return installer(options);
  }
}
