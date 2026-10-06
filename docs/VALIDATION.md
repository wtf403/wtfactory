# Validation evidence

The implementation is not ready for live agent execution. Compilation, installer idempotency, and broker security checks are verified separately from runtime success.

## Fresh package installs, 2026-10-07

A tarball was produced with `npm pack` and executed with `npm exec --package=<local tarball> -- wtfactory` from clean Vite repositories. It was not published to npm. Explicit test-only mode/profile/endpoint/model were supplied; no provider credential was invented.

- Personal repository: https://github.com/wtf403/wtfactory-e2e-20261007-personal
- Organization repository: https://github.com/TestOrgWTF/wtfactory-e2e-20261007-org
- Both initial main branches were pushed. Personal Vite production build passed.
- Normal setup detected the correct repository, compiled the generated workflow, and then stopped with `NEED_PROJECT_SCOPE`. No setup branch or PR was pushed. Neither repository has a board created by this test. Existing GitHub CLI authorization lacks `project` and `read:project`.
- `TestOrgWTF` is accessible and the user is an active member; successful organization Projects creation is not verified. Organization policy and project-creation permission may require administrator action after OAuth scope approval.
- Interactive setup now starts direct GitHub CLI device authorization on missing Projects scope and retries once after approval. Externally provided tokens and noninteractive runs receive an actionable failure instead of an auth loop. No GitHub bearer credential is transmitted to the broker.

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
- Worker dry-run bundle succeeds. Broker dependency audit reports zero vulnerabilities.

## Activation gaps

1. Approve direct GitHub Projects authorization and repeat both fresh package installs; verify actual boards, fields, repository links and repeat-run idempotency.
2. Configure a real provider profile/key. `AGENT_API_KEY` is the fixed repository secret; native engine names map to it in the generated workflow.
3. Install/configure the shared App and configure backend App ID, PKCS8 private key, audience and enrollment policy. The private key never belongs in customer repository secrets.
4. Automatic authenticated enrollment and persistent enrollment storage are not implemented. Automatic approval review rejected the proposed transmission of the existing GitHub bearer credential to the Worker and creation of Cloudflare KV storage. Neither action was executed.
5. Runtime Projects status synchronization is not implemented. A personal Project requires separately authorized user access; the repository-scoped App token does not provide it. A scoped organization Projects integration is also separate from the broker's repository token.
6. Pi's compiled threat detection may require additional authentication. It was not disabled to hide the prerequisite.

No live-success or full end-to-end claim is made by this evidence.
