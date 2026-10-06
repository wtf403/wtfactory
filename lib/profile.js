export function baseUrl(value) {
  const u = new URL(value.includes("://") ? value : `https://${value}`);
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.hash ||
    u.search
  )
    throw new Error(
      "Use a provider URL without credentials, query or fragment",
    );
  return u.href.replace(/\/$/, "");
}
export function validateProfile(p) {
  if (!["harness", "own"].includes(p.mode))
    throw new Error("AGENT_MODE must be harness or own");
  const allowed =
    p.mode === "harness" ? ["pi"] : ["codex", "claude", "gemini", "pi"];
  if (!allowed.includes(p.profile))
    throw new Error(`Supported profiles: ${allowed.join(", ")}`);
  if (!p.model || /[\r\n]/.test(p.model))
    throw new Error("Provide AGENT_MODEL");
  return { ...p, base: p.base ? baseUrl(p.base) : "" };
}
