# wtfactory

Run `npx wtfactory` from a GitHub repository. The wizard detects the target repository, asks for a preconfigured Pi harness or a user-owned supported agent runtime, collects the endpoint/model and a masked provider key, validates workflow compilation, creates or reuses and links a Projects board, and creates or updates one `factory/setup` PR. Review and merge the PR before dispatching an issue. Factory's source repository cannot be installed.

For automation, set `FACTORY_REPO`, `AGENT_MODE=harness|own`, `AGENT_PROFILE=pi|codex|claude|gemini`, `AGENT_MODEL`, optional `AGENT_BASE_URL`, and `AGENT_API_KEY`. `harness` currently supports Pi with an OpenAI-compatible endpoint; `own` preserves repository skills/plugins and supports the listed gh-aw runtimes. Use `--dry-run` to avoid remote mutation. Empty key input retains an existing repository secret. No provider key is committed.

Requires Node 18+, Git, authenticated `gh`, and `gh aw`. Provider authentication and GitHub authentication are separate. Projects creation/linking is required by normal setup and needs project/read:project scope in the authenticated GitHub CLI token. In an interactive terminal, missing Projects scope starts GitHub device authorization and resumes setup when approved. Noninteractive runs and externally supplied GH_TOKEN/GITHUB_TOKEN credentials stop before pushing; provide a credential authorized for Projects and rerun. Organization policy or SSO can require organization approval even with the Projects scope. The local GitHub credential goes only to GitHub, never to the broker. The advanced --skip-projects flag is diagnostic only and explicitly reports an incomplete installation. ARC infrastructure remains optional.

## Shared GitHub App broker

The Cloudflare Worker in `broker/` validates signed GitHub Actions OIDC assertions against GitHub's JWKS, issuer, configured audience, expiration, repository and owner numeric IDs, exact workflow path and trusted branch ref. Pull-request/fork contexts and other events are denied. It confirms the App installation, then requests an installation token limited to that repository and Contents/Issues/Pull requests write. Tokens expire according to GitHub's installation-token lifetime (one hour); do not log them. The App private key lives only in backend secrets.

Set `FACTORY_BROKER_URL` to use the broker. The generated workflow obtains independently masked job-local credentials; credentials do not cross jobs through artifacts or job outputs. Compiler v0.88.7 requires mint hooks in agent, safe_outputs and conclusion because all three consume the safe-output token.

**Current readiness:** automatic enrollment is not implemented. It needs separately approved setup authentication and policy storage. The broker permits only explicitly enrolled repositories; live token minting is verified for the disposable test repo in docs/VALIDATION.md. Provider keys, the App installation/private key, and any required threat-detection authentication must be available before runtime execution can succeed.

Personal Projects require a user credential with Projects scope; enabling App device flow does not itself grant Projects permission; organization Projects may use an App granted organization Projects permission. A repository installation token is not a substitute for a personal Projects user token. `PROJECT_URL` records the linked board context; it does not grant runtime board access. Runtime board status synchronization is not implemented yet.

## Broker operator setup

From `broker/`, run `npm install`, `npm test`, and `npm run build`. Deploy using an already authenticated Cloudflare account with `npm run deploy`. Use Wrangler backend secret management for `APP_ID`, `APP_PRIVATE_KEY` (PKCS8 PEM), `OIDC_AUDIENCE` (the exact broker origin), and `REPOSITORY_POLICIES` (JSON map of repository slug to `repositoryId`, `ownerId`, `installationId`, and `ref`). Never place these values in customer repository secrets or the npm package. No Durable Object is used. No webhook is required.

The default Worker name is `wtfactory-token-broker`; inspect your account before deploying to an existing Worker. Unconfigured brokers report `configured:false` at `/health` and return 401 for `/token`.

## Validation

`npm test` runs endpoint/profile tests, local Git integration tests for non-main defaults and idempotent branch/PR setup, and broker signature/claim/installation denial tests. Live compilation uses `gh aw compile`; compiler success is not runtime success. Pi's default threat detection may require Copilot authentication in addition to the provider key; the installer does not disable detection to hide that prerequisite.
