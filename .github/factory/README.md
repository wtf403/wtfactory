# factory (installed)

Installed by wtfactory. Four files matter here:

    .github/workflows/factory.md          the agentic workflow (source of truth)
    .github/workflows/factory.lock.yml    compiled; do not edit by hand
    .github/factory/chat-session.mjs      session controller run on the runner
    .github/workflows/factory-session.yml dispatches one chat session per work item

## Credentials

The workflow has two independent authentication directions. The GitHub App
and model provider fail in different places; the Copilot harness needs no
model secret.

1. GitHub App (runner -> GitHub). Create it from
   `.github/agent-factory/create-app.html` in the wtfactory repo, install it here,
   then set:

       gh variable set APP_ID --repo OWNER/REPO --body <client-id>
       gh secret set APP_PRIVATE_KEY --repo OWNER/REPO

2. Model credential (agent -> provider). Set the one matching this install (OpenAI Codex):

    gh secret set OPENAI_API_KEY --repo OWNER/REPO

Without the model credential the workflow stops at the activation check with "secret is not set" and the agent job never starts.

## Board

`PROJECT_URL` points at the Projects V2 board. Its `Status` field is the state
machine and must hold exactly:

    TODO | Analytics | InProgress | Test | Review | Completed

Check it with `npx wtfactory doctor --repo OWNER/REPO`.

## Working

Move a card to a phase, or dispatch `factory session`. The controller claims the
item, names a chat thread, and dispatches the agentic workflow. Steer by
commenting `factory-steer: <instruction>` on the issue or pull request.

