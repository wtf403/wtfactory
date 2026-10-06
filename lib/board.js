import { gh } from "./gh.js";
export const STATUSES = [
  "TODO",
  "Analytics",
  "InProgress",
  "Test",
  "Review",
  "Completed",
];
function q(query, variables = {}) {
  const r = gh(["api", "graphql", "--input", "-"], {
    input: JSON.stringify({ query, variables }),
  });
  if (r.status !== 0) {
    const detail = r.stderr + r.stdout;
    const e = new Error(
      /INSUFFICIENT_SCOPES|requires one of the following scopes|missing required scopes/i.test(
        detail,
      )
        ? "NEED_PROJECT_SCOPE"
        : detail.slice(0, 2000),
    );
    throw e;
  }
  const result = JSON.parse(r.stdout);
  if (result.errors?.length)
    throw new Error(result.errors.map((e) => e.message).join("; "));
  return result.data;
}
export async function createBoard(
  { owner, title = "Agent Factory", repo, url },
  graphql = q,
) {
  const who = graphql(
    "query($login:String!){repositoryOwner(login:$login){id login __typename}}",
    { login: owner },
  ).repositoryOwner;
  if (!who) throw new Error(`owner not found: ${owner}`);
  const kind = who.__typename === "Organization" ? "organization" : "user";
  let project;
  if (url) {
    const parsed = new URL(url);
    const m = parsed.pathname.match(
      /^\/(?:users|orgs)\/([^/]+)\/projects\/(\d+)\/?$/,
    );
    if (
      parsed.origin !== "https://github.com" ||
      !m ||
      m[1].toLowerCase() !== owner.toLowerCase()
    )
      throw new Error("Project URL must belong to the repository owner");
    project = graphql(
      `query($login:String!,$number:Int!){${kind}(login:$login){projectV2(number:$number){id number url title}}}`,
      { login: owner, number: Number(m[2]) },
    )[kind].projectV2;
    if (!project) throw new Error("Project not accessible");
  } else {
    let cursor = null;
    do {
      const page = graphql(
        `query($login:String!,$cursor:String){${kind}(login:$login){projectsV2(first:100,after:$cursor){nodes{id number url title} pageInfo{hasNextPage endCursor}}}}`,
        { login: owner, cursor },
      )[kind].projectsV2;
      project = page.nodes.find((p) => p.title === title);
      cursor =
        !project && page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (cursor);
  }
  if (!project)
    project = graphql(
      "mutation($owner:ID!,$title:String!){createProjectV2(input:{ownerId:$owner,title:$title}){projectV2{id number url title}}}",
      { owner: who.id, title },
    ).createProjectV2.projectV2;
  const fields = graphql(
    "query($id:ID!){node(id:$id){... on ProjectV2{fields(first:100){nodes{... on ProjectV2Field{id name dataType} ... on ProjectV2SingleSelectField{id name options{id name color description}}}} items(first:1){totalCount}}}}",
    { id: project.id },
  ).node;
  const definitions = [
    ["Status", "SINGLE_SELECT", STATUSES],
    ["Priority", "SINGLE_SELECT", ["Low", "Medium", "High"]],
    ["Team", "SINGLE_SELECT", ["Platform", "Docs", "Product"]],
    [
      "CI Status",
      "SINGLE_SELECT",
      ["pending", "passed", "failed", "timed_out"],
    ],
    ["Attempt", "NUMBER"],
    ["PR", "TEXT"],
    ["Head SHA", "TEXT"],
    ["Blocker Reason", "TEXT"],
    ["Cost", "TEXT"],
  ];
  const options = (names) =>
    names.map((name) => ({ name, color: "GRAY", description: "" }));
  for (const [name, dataType, names] of definitions) {
    const current = fields.fields.nodes.find((f) => f.name === name);
    if (!current) {
      graphql(
        "mutation($input:CreateProjectV2FieldInput!){createProjectV2Field(input:$input){projectV2Field{... on ProjectV2Field{id} ... on ProjectV2SingleSelectField{id}}}}",
        {
          input: {
            projectId: project.id,
            name,
            dataType,
            ...(names ? { singleSelectOptions: options(names) } : {}),
          },
        },
      );
    } else if (
      names &&
      !names.every((n) => current.options?.some((o) => o.name === n))
    ) {
      if (fields.items.totalCount > 0)
        throw new Error(
          `Existing populated project is missing ${name} options; adjust its field before rerunning`,
        );
      const opts = options(names);
      graphql(
        "mutation($input:UpdateProjectV2FieldInput!){updateProjectV2Field(input:$input){projectV2Field{... on ProjectV2SingleSelectField{id}}}}",
        { input: { fieldId: current.id, singleSelectOptions: opts } },
      );
    }
  }
  if (repo) {
    const repository = graphql(
      "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id}}",
      { owner, name: repo.split("/")[1] },
    ).repository;
    graphql(
      "mutation($project:ID!,$repository:ID!){linkProjectV2ToRepository(input:{projectId:$project,repositoryId:$repository}){repository{id}}}",
      { project: project.id, repository: repository.id },
    );
  }
  return { ...project, ownerType: kind };
}
