import { getSandbox } from "@cloudflare/sandbox";
import type { Env, SandboxMeta } from "./types";
import { parseRepoUrl, buildTarballCandidates } from "./repo";

const OPENCODE_PORT = 4096;

function makeSandboxId(): string {
  return crypto.randomUUID();
}

function buildBootScript(
  tarUrls: string[],
  owner: string,
  repoName: string,
  port: number,
  githubToken?: string,
  envExports = ""
): string {
  const header = githubToken
    ? `-H "Authorization: token ${githubToken}"`
    : "";
  const dir = `/workspace/${repoName}`;
  const tmp = `/tmp/${repoName}.tar.gz`;

  const urlCalls = tarUrls
    .map((u) => `try_url "${u}" && cloned=1`)
    .join("\n");

  return `set +e
exec >/tmp/boot.log 2>&1
echo "[boot] $(date -u +%FT%TZ) starting"
${envExports}
mkdir -p ${dir}
try_url() {
  local url="$1"
  echo "[clone] trying $url"
  local code
  code=$(curl -sL -o ${tmp} -w "%{http_code}" ${header} "$url")
  if [ "$code" = "200" ] && gzip -t ${tmp} 2>/dev/null; then
    tar xzf ${tmp} --strip-components=1 -C ${dir}
    rm -f ${tmp}
    return 0
  fi
  echo "[clone]   HTTP $code, not a valid gzip archive" >&2
  return 1
}
cloned=0
${urlCalls}
if [ "$cloned" != "1" ]; then
  echo "[clone] resolving default branch"
  default_branch=$(curl -sL ${header} "https://api.github.com/repos/${owner}/${repoName}" | grep -o '"default_branch"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\\([^"]*\\)"$/\\1/')
  if [ -n "$default_branch" ]; then
    try_url "https://codeload.github.com/${owner}/${repoName}/tar.gz/refs/heads/$default_branch" && cloned=1
  fi
fi
if [ "$cloned" != "1" ]; then
  echo "[clone] all tarball URLs failed" >&2
  exit 1
fi
echo "[serve] starting opencode on :${port}"
cd ${dir}
exec opencode serve --print-logs --port ${port} --hostname 0.0.0.0
`;
}

export async function createSandbox(
  env: Env,
  repoUrl: string,
  branch: string | undefined,
  userEnv: Record<string, string> = {}
): Promise<SandboxMeta> {
  const parsed = parseRepoUrl(repoUrl);
  const resolvedBranch = branch ?? parsed.branch;
  const sandboxId = makeSandboxId();

  const sandbox = getSandbox(env.Sandbox, sandboxId, { normalizeId: true });

  const githubToken = userEnv.GITHUB_TOKEN;
  const explicitBranch = branch !== undefined || parsed.branch !== "main";
  const tarUrls = buildTarballCandidates(
    { ...parsed, branch: resolvedBranch },
    Boolean(githubToken),
    explicitBranch
  );

  const envExports = Object.entries(userEnv)
    .filter(([key]) => key !== "GITHUB_TOKEN")
    .map(([key, value]) => `export ${key}='${value.replace(/'/g, "'\\''")}'`)
    .join("\n");

  const bootScript = buildBootScript(
    tarUrls,
    parsed.owner,
    parsed.repo,
    OPENCODE_PORT,
    githubToken,
    envExports
  );
  const scriptPath = `/tmp/boot-${sandboxId}.sh`;
  await sandbox.writeFile(scriptPath, bootScript);
  await sandbox.startProcess(`bash ${scriptPath}`);

  return {
    sandboxId,
    repoUrl: `${parsed.owner}/${parsed.repo}`,
    agent: "opencode",
    createdAt: new Date().toISOString(),
  };
}

export async function destroySandbox(
  env: Env,
  sandboxId: string
): Promise<void> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { normalizeId: true });
  await sandbox.destroy();
}

export async function proxyToOpenCode(
  env: Env,
  sandboxId: string,
  path: string,
  request: Request
): Promise<Response> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { normalizeId: true });

  const url = `http://localhost:${OPENCODE_PORT}${path}`;
  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return sandbox.containerFetch(url, init, OPENCODE_PORT);
}
