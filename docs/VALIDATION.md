# Validation evidence

The implementation is not ready for live agent execution. Compilation, installer idempotency, and broker security checks are verified separately from runtime success.

## Fresh package installs, 2026-10-07

A tarball was produced with `npm pack` and executed with `npm exec --package=<local tarball> -- wtfactory` from clean Vite repositories. It was not published to npm. Explicit test-only mode/profile/endpoint/model were supplied; no provider credential was invented.

- Personal repository: https://github.com/wtf403/wtfactory-e2e-20261007-personal
- Organization repository: https://github.com/TestOrgWTF/wtfactory-e2e-20261007-org
- Fresh personal issue: https://github.com/wtf403/wtfactory-e2e-20261007-personal/issues/1
- Fresh organization issue: https://github.com/TestOrgWTF/wtfactory-e2e-20261007-org/issues/1
- Both initial main branches were pushed. Personal Vite production build passed.
- Normal setup detected the correct repository, compiled the generated workflow, and then stopped with `NEED_PROJECT_SCOPE`. No setup branch or PR was pushed. Neither repository has a board created by this test. Existing GitHub CLI authorization lacks `project` and `read:project`.
- `TestOrgWTF` is accessible and the user is an active member; successful organization Projects creation is not verified. Organization policy and project-creation permission may require administrator action after OAuth scope approval.
- Interactive setup now starts direct GitHub CLI device authorization on missing Projects scope and retries once after approval. Externally provided tokens and noninteractive runs receive an actionable failure instead of an auth loop. No GitHub bearer credential is transmitted to the broker.

## Additional requested fresh repository

Repository: https://github.com/wtf403/wtfactory-e2e-20261007-fresh

Issue: https://github.com/wtf403/wtfactory-e2e-20261007-fresh/issues/1

The latest installer from this PR was run from the new clean repository. It detected the repository, compiled the workflow and attempted mandatory Projects setup. It stopped on missing Projects scope; no setup branch or PR was pushed and no board was created. The repository contains only its initial main branch. Vite production build passed. A real GitHub CLI device authorization request was started; authorization codes are temporary and must not be treated as persistent validation artifacts.

## Earlier runtime test

- Private Vite repository: https://github.com/wtf403/wtfactory-broker-e2e-disposable-20261006
- Issue: https://github.com/wtf403/wtfactory-broker-e2e-disposable-20261006/issues/2
- Initial setup PR: https://github.com/wtf403/wtfactory-broker-e2e-disposable-20261006/pull/1
- Corrected per-job OIDC permissions: https://github.com/wtf403/wtfactory-broker-e2e-disposable-20261006/pull/3
- Actual corrected runtime: https://github.com/wtf403/wtfactory-broker-e2e-disposable-20261006/actions/runs/37521859758

Setup was explicitly diagnostic with Projects skipped. Two repeat installations reused the same PR and introduced no empty commits. The setup PRs were merged only in the disposable repository.

The corrected runtime failed. Pre-activation passed; activation failed on missing provider authentication. Conclusion successfully obtained an Actions OIDC assertion and reached the broker, which denied the run because the backend is unconfigured. The agent and safe outputs did not execute; no agent-created PR or board status progression is verified. The subsequent missing `github-token` errors are consequences of broker denial. The earlier run had missing OIDC permissions; do not describe that earlier error as broker denial.

## Backend and automated checks

Deployed endpoint: https://wtfactory-token-broker.wtf403.workers.dev

- GET `/health`: `configured:false`.
- POST `/token` with an invalid assertion: HTTP 401 with `unauthorized`.
- Broker unit tests verify real RSA-signed assertions with wrong issuer, audience, signature, expiry, repository/owner/installation identity, event, branch and workflow path. Valid signed enrolled assertions reach minting in controlled tests only.
- Mint tests verify installation ownership and request a single repository with Contents, Issues and Pull requests write permissions.
- Generated-hook execution test verifies OIDC audience and Authorization headers, masking, and a real newline in `GITHUB_OUTPUT`.
- Local Git installer tests cover a non-main default branch, repeated installation without new commits/PRs, reuse after merging, compilation failure before push, and missing Projects authorization before push or variables.
- Board tests cover fresh User and Organization ownership, built-in Status reuse, correctly typed field options, repository linking, repeated creation without duplicate projects/fields, and missing authorization without mutations.
- All 20 installer/profile/board/package tests and all 20 broker security tests pass.
- Worker dry-run bundle succeeds. Broker dependency audit reports zero vulnerabilities.

## Activation gaps

1. Approve direct GitHub Projects authorization and repeat both fresh package installs; verify actual boards, fields, repository links and repeat-run idempotency.
2. Configure a real provider profile/key. `AGENT_API_KEY` is the fixed repository secret; native engine names map to it in the generated workflow.
3. The user-approved App key was verified against App ID 5214965 and uploaded only to the existing Worker APP_PRIVATE_KEY slot, with PKCS8 conversion in memory and no temporary key copies. APP_ID and OIDC_AUDIENCE are also configured. After the user installed the App, installation 168682498 was verified and a precise static enrollment policy was configured for repository 1408019808, owner 73958047, refs/heads/main only. The private key never belongs in customer repository secrets. Real broker minting is now verified; see the live evidence below.
4. Automatic authenticated enrollment and persistent enrollment storage are not implemented. Automatic approval review rejected the proposed transmission of the existing GitHub bearer credential to the Worker and creation of Cloudflare KV storage. Neither action was executed.
5. Runtime Projects status synchronization is not implemented. A personal Project requires separately authorized user access; the repository-scoped App token does not provide it. A scoped organization Projects integration is also separate from the broker's repository token.
6. Pi's compiled threat detection may require additional authentication. It was not disabled to hide the prerequisite.

No live-success or full end-to-end claim is made by this evidence.

## Approved installation and real broker validation

The fresh test repository is enrolled in the existing Worker with the verified installation ID 168682498. Health reports configured:true, which is configuration-presence evidence only. Actual authentication was separately verified by the following runs:

- Trusted-main OIDC mint/scope/denials: https://github.com/wtf403/wtfactory-e2e-20261007-fresh/actions/runs/37549545999 — success.
- Untrusted-branch denial: https://github.com/wtf403/wtfactory-e2e-20261007-fresh/actions/runs/37549372243 — success.
- Pull-request context denial: https://github.com/wtf403/wtfactory-e2e-20261007-fresh/actions/runs/37549494313 — success.
- Disposable diagnostic PRs: https://github.com/wtf403/wtfactory-e2e-20261007-fresh/pull/2, https://github.com/wtf403/wtfactory-e2e-20261007-fresh/pull/3, https://github.com/wtf403/wtfactory-e2e-20261007-fresh/pull/4. These were merged in the disposable repo only.

The trusted run verified exactly one repository in the minted token, successful enrolled-repo contents access, rejection of another private repo, HTTP 401 for a wrong OIDC audience, and HTTP 401 for a tampered identity/signature. No token or key was printed. No App key or provider key is stored in the customer repo.

Live testing exposed two current GitHub format changes: new repositories use immutable owner/repository IDs in the OIDC subject, and App installation tokens use the stateless ghs_APPID_JWT format. The broker now accepts only the exact legacy or immutable subject derived from the enrolled IDs/ref; the client treats tokens as opaque nonempty single-line strings. Regression tests cover these changes, and the final installer workflow compiles successfully.

A separate actual personal Projects attempt used an App installation token with its granted repository Projects permission. GitHub rejected createProjectV2 with: wtfactory[bot] does not have permission to create projects on the user owner. That temporary setup token was revoked. App device flow returned device_flow_disabled. The current CLI user credential still lacks project scope. Thus no board URL exists yet; user Projects authorization remains required. Enabling an App device flow is not claimed to grant personal Projects access. The official Projects REST API documentation says personal Projects endpoints do not support App user or installation tokens; gh-aw recommends a classic user token for personal Projects and organization Projects permission for an org App.

The App is not installed on TestOrgWTF (authenticated App lookup HTTP 404), so live organization App-backed board creation is not verified or attempted without that installation. Both owner paths retain mocked creation/link/idempotency coverage. The fresh repository has no AGENT_API_KEY; agent execution and board status synchronization are not ready.

Primary format references: https://docs.github.com/en/actions/reference/security/oidc and https://github.blog/changelog/2026-10-02-stateless-github-app-installation-tokens-rolled-out/.
Projects references: https://github.github.com/gh-aw/reference/auth-projects/ and https://docs.github.com/en/rest/projects/projects.
