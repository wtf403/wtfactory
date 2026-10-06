import { createRemoteJWKSet, jwtVerify, importPKCS8, SignJWT } from "jose";
const issuer = "https://token.actions.githubusercontent.com";
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
const reject = () => {
  throw new Error("denied");
};
export function authorizeClaims(
  c,
  policies,
  audience,
  now = Math.floor(Date.now() / 1000),
) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(c.repository || "") ||
    !Object.hasOwn(policies, c.repository)
  )
    reject();
  const p = policies[c.repository];
  if (
    ![p.repositoryId, p.ownerId, p.installationId].every((v) =>
      /^[1-9][0-9]*$/.test(String(v)),
    )
  )
    reject();
  if (
    !p ||
    c.iss !== issuer ||
    c.aud !== audience ||
    !Number.isInteger(c.exp) ||
    c.exp <= now ||
    !Number.isInteger(c.iat) ||
    c.iat > now + 30 ||
    now - c.iat > 600
  )
    reject();
  if (
    String(c.repository_id) !== String(p.repositoryId) ||
    String(c.repository_owner_id) !== String(p.ownerId)
  )
    reject();
  if (
    c.ref !== p.ref ||
    c.workflow_ref !==
      `${c.repository}/.github/workflows/factory.lock.yml@${p.ref}` ||
    c.sub !== `repo:${c.repository}:ref:${p.ref}`
  )
    reject();
  if (
    !["issues", "workflow_dispatch"].includes(c.event_name) ||
    c.ref_type !== "branch"
  )
    reject();
  if (c.job_workflow_ref && c.job_workflow_ref !== c.workflow_ref) reject();
  return p;
}
export async function mintToken(c, p, env, fetcher = fetch) {
  const key = await importPKCS8(env.APP_PRIVATE_KEY, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const appJwt = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(env.APP_ID)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 540)
    .sign(key);
  const api = async (path, options = {}) => {
    const r = await fetcher(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "wtfactory-broker",
        "Content-Type": "application/json",
      },
    });
    if (!r.ok) reject();
    return r.json();
  };
  const installation = await api(`/repos/${c.repository}/installation`);
  if (
    String(installation.id) !== String(p.installationId) ||
    String(installation.account.id) !== String(p.ownerId) ||
    installation.suspended_at
  )
    reject();
  const token = await api(
    `/app/installations/${installation.id}/access_tokens`,
    {
      method: "POST",
      body: JSON.stringify({
        repository_ids: [Number(p.repositoryId)],
        permissions: {
          contents: "write",
          issues: "write",
          pull_requests: "write",
        },
      }),
    },
  );
  return { token: token.token, expires_at: token.expires_at };
}
export async function verifyOidc(token, audience, keyset = jwks) {
  return (
    await jwtVerify(token, keyset, {
      issuer,
      audience,
      algorithms: ["RS256"],
      maxTokenAge: "10m",
      requiredClaims: [
        "exp",
        "iat",
        "sub",
        "repository",
        "repository_id",
        "repository_owner_id",
        "workflow_ref",
        "ref",
        "event_name",
      ],
    })
  ).payload;
}
export function createHandler(verify = verifyOidc, mint = mintToken) {
  return async (request, env) => {
    const headers = {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    };
    if (new URL(request.url).pathname === "/health" && request.method === "GET")
      return Response.json(
        {
          service: "wtfactory-broker",
          configured: Boolean(
            env.APP_ID &&
            env.APP_PRIVATE_KEY &&
            env.REPOSITORY_POLICIES &&
            env.OIDC_AUDIENCE,
          ),
        },
        { headers },
      );
    if (new URL(request.url).pathname !== "/token" || request.method !== "POST")
      return new Response("Not found", { status: 404, headers });
    try {
      if (
        !env.APP_ID ||
        !env.APP_PRIVATE_KEY ||
        !env.OIDC_AUDIENCE ||
        !env.REPOSITORY_POLICIES
      )
        reject();
      const auth = request.headers.get("authorization") || "";
      if (!auth.startsWith("Bearer ") || auth.length > 16384) reject();
      const c = await verify(auth.slice(7), env.OIDC_AUDIENCE);
      const p = authorizeClaims(
        c,
        JSON.parse(env.REPOSITORY_POLICIES),
        env.OIDC_AUDIENCE,
      );
      return Response.json(await mint(c, p, env), { headers });
    } catch {
      return Response.json({ error: "unauthorized" }, { status: 401, headers });
    }
  };
}
export default { fetch: createHandler() };
