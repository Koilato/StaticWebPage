import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadAndValidatePages } from "../../../../scripts/site-utils.mjs";

const OWNER = "Koilato";
const REPO = "StaticWebPage";
const DEFAULT_BRANCH = "main";
const SITE = "https://static-web-page-pied.vercel.app";
const API_ROOT = "https://api.github.com";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SIZE = 100 * 1024 * 1024;
const REQUIRED_CHECK = "publish-check";
const REQUIRED_WORKFLOW_PATH = ".github/workflows/publish-check.yml";
const GITHUB_ACTIONS_INTEGRATION_ID = 15368;
const SENSITIVE_PATTERNS = [
  {
    label: "GitHub 令牌",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
  {
    label: "Authorization 凭据",
    pattern:
      /\bauthorization\s*[:=]\s*["'`]?(?:bearer|basic)\s+[A-Za-z0-9._~+/-]{8,}/i,
  },
  {
    label: "Cookie",
    pattern:
      /\b(?:cookie|set-cookie)\s*[:=]\s*(?:["'`][^"'`\r\n]{8,}|[^\s;"'`]{8,})/i,
  },
  {
    label: "密码或访问密钥",
    pattern:
      /\b(?:password|passwd|pwd|api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*(?:["'`][^"'`\r\n]{8,}|[^\s,;#"'`]{8,})/i,
  },
  {
    label: "带密码的连接串",
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^/\s:@]+:[^@\s/]+@/i,
  },
  {
    label: "私钥",
    pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
];

function parseArgs(args) {
  const result = {
    ref: [],
    clearRef: false,
    dryRun: false,
    pr: false,
  };
  const valueOptions = new Set([
    "source",
    "slug",
    "title",
    "description",
    "tags",
    "date",
    "ref",
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--clear-ref") {
      result.clearRef = true;
      continue;
    }
    if (argument === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (argument === "--pr") {
      result.pr = true;
      continue;
    }
    if (!argument?.startsWith("--")) {
      usage(`参数格式无效：${argument ?? ""}`);
    }
    const key = argument.slice(2);
    if (!valueOptions.has(key)) {
      usage(`未知参数：${argument}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      usage(`${argument} 缺少值。`);
    }
    if (key !== "ref" && result[key] !== undefined) {
      usage(`${argument} 不得重复。`);
    }
    if (key === "ref") {
      result.ref.push(value);
    } else {
      result[key] = value;
    }
    index += 1;
  }
  return result;
}

function validateOptions(options) {
  for (const required of ["source", "slug", "title"]) {
    if (!options[required]) usage(`缺少 --${required}。`);
  }
  if (options.dryRun === options.pr) {
    usage("必须且只能指定 --dry-run 或 --pr。");
  }
  if (options.clearRef && options.ref.length) {
    usage("--clear-ref 不得与 --ref 同时使用。");
  }
  if (!SLUG_PATTERN.test(options.slug)) {
    usage(`slug 无效：${options.slug}`);
  }
  if (options.date && !DATE_PATTERN.test(options.date)) {
    usage("--date 必须使用 YYYY-MM-DD。");
  }
}

function selectBlobEncoding(buffer) {
  if (buffer.includes(0)) {
    return { content: buffer.toString("base64"), encoding: "base64" };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (Buffer.from(text, "utf8").equals(buffer)) {
      return { content: text, encoding: "utf-8" };
    }
  } catch {
    // 使用 Base64 保留任意二进制内容。
  }
  return { content: buffer.toString("base64"), encoding: "base64" };
}

function validateFileSize(size, label) {
  if (size > MAX_SIZE) {
    throw new Error(`${label} 超过 100 MiB，本版不支持 Git LFS。`);
  }
}

function assertNoSensitiveContent(buffer, label) {
  const content = buffer.toString("utf8");
  const match = SENSITIVE_PATTERNS.find(({ pattern }) => pattern.test(content));
  if (match) {
    throw new Error(`${label} 包含疑似${match.label}，已停止发布。`);
  }
}

function gitBlobSha(buffer) {
  return createHash("sha1")
    .update(`blob ${buffer.length}\0`)
    .update(buffer)
    .digest("hex");
}

function createGitHubClient(token) {
  const baseHeaders = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "StaticWebPage-publisher",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  async function request(apiPath, { method = "GET", body } = {}) {
    const response = await fetch(`${API_ROOT}${apiPath}`, {
      method,
      headers: {
        ...baseHeaders,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      payload = text;
    }
    if (!response.ok) {
      const detail =
        payload && typeof payload === "object"
          ? payload.message ?? JSON.stringify(payload)
          : payload;
      const error = new Error(
        `GitHub API ${method} ${apiPath} 返回 HTTP ${response.status}` +
          (detail ? `：${detail}` : ""),
      );
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function requestRaw(apiPath) {
    const response = await fetch(`${API_ROOT}${apiPath}`, {
      headers: {
        ...baseHeaders,
        Accept: "application/vnd.github.raw+json",
      },
    });
    if (!response.ok) {
      throw new Error(
        `GitHub API GET ${apiPath} 返回 HTTP ${response.status}：${await response.text()}`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async function graphql(query, variables) {
    const payload = await request("/graphql", {
      method: "POST",
      body: { query, variables },
    });
    if (payload.errors?.length) {
      throw new Error(
        `GitHub GraphQL 返回错误：${payload.errors
          .map((error) => error.message)
          .join("；")}`,
      );
    }
    return payload.data;
  }

  return { graphql, request, requestRaw };
}

function resolveGitHubToken(useCredentialHelper) {
  const environmentToken =
    process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  if (environmentToken || !useCredentialHelper) return environmentToken;

  const result = spawnSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
    timeout: 5_000,
  });
  if (result.status !== 0) return undefined;
  const password = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("password="));
  return password?.slice("password=".length).trim() || undefined;
}

async function readRepositoryState(api) {
  const reference = await api.request(
    `/repos/${OWNER}/${REPO}/git/ref/heads/${DEFAULT_BRANCH}`,
  );
  const commitSha = reference.object.sha;
  const commit = await api.request(
    `/repos/${OWNER}/${REPO}/git/commits/${commitSha}`,
  );
  const treeSha = commit.tree.sha;
  const recursive = await api.request(
    `/repos/${OWNER}/${REPO}/git/trees/${treeSha}?recursive=1`,
  );
  const entries = recursive.truncated
    ? await walkTree(api, treeSha)
    : recursive.tree;
  return {
    commitSha,
    treeSha,
    entries,
    byPath: new Map(entries.map((entry) => [entry.path, entry])),
  };
}

async function verifyRepositoryPrerequisites(api) {
  const [repository, branch, rules, workflows] = await Promise.all([
    api.request(`/repos/${OWNER}/${REPO}`),
    api.request(`/repos/${OWNER}/${REPO}/branches/${DEFAULT_BRANCH}`),
    api.request(
      `/repos/${OWNER}/${REPO}/rules/branches/${DEFAULT_BRANCH}?per_page=100`,
    ),
    api.request(`/repos/${OWNER}/${REPO}/actions/workflows?per_page=100`),
  ]);
  const pullRequestRule = rules.find((rule) => rule.type === "pull_request");
  const statusRule = rules.find(
    (rule) => rule.type === "required_status_checks",
  );
  const requiredContexts =
    statusRule?.parameters?.required_status_checks?.map(
      (check) => check.context,
    ) ?? [];
  const requiredCheck = statusRule?.parameters?.required_status_checks?.find(
    (check) => check.context === REQUIRED_CHECK,
  );
  const workflow = workflows.workflows?.find(
    (item) => item.path === REQUIRED_WORKFLOW_PATH,
  );
  const failures = [];
  if (!branch.protected) failures.push("main 尚未受保护");
  if (!pullRequestRule) failures.push("main 未要求通过 PR 合并");
  if (!requiredContexts.includes(REQUIRED_CHECK)) {
    failures.push(`main 未把 ${REQUIRED_CHECK} 设为必需检查`);
  }
  if (
    requiredCheck &&
    requiredCheck.integration_id !== GITHUB_ACTIONS_INTEGRATION_ID
  ) {
    failures.push(`${REQUIRED_CHECK} 的来源不是 GitHub Actions`);
  }
  if (!workflow) {
    failures.push(`仓库缺少 ${REQUIRED_WORKFLOW_PATH}`);
  } else if (workflow.state !== "active") {
    failures.push(`${REQUIRED_WORKFLOW_PATH} 未启用`);
  }
  if (
    pullRequestRule &&
    !pullRequestRule.parameters?.allowed_merge_methods?.includes("squash")
  ) {
    failures.push("main 的 PR 规则未允许 squash merge");
  }
  if (repository.allow_auto_merge !== true) {
    failures.push("仓库未启用 auto-merge");
  }
  if (repository.allow_squash_merge !== true) {
    failures.push("仓库未启用 squash merge");
  }
  if (repository.delete_branch_on_merge !== true) {
    failures.push("仓库未启用合并后删除 head branch");
  }
  if (failures.length) {
    throw new Error(`GitHub 发布前提不满足：${failures.join("；")}。`);
  }
}

async function walkTree(api, rootTreeSha) {
  const entries = [];
  const pending = [{ prefix: "", sha: rootTreeSha }];
  while (pending.length) {
    const current = pending.shift();
    const tree = await api.request(
      `/repos/${OWNER}/${REPO}/git/trees/${current.sha}`,
    );
    if (tree.truncated) {
      throw new Error(
        `GitHub Tree ${current.sha} 的逐层读取仍被截断，已停止发布。`,
      );
    }
    for (const entry of tree.tree) {
      const fullPath = path.posix.join(current.prefix, entry.path);
      const normalized = { ...entry, path: fullPath };
      entries.push(normalized);
      if (entry.type === "tree") {
        pending.push({ prefix: fullPath, sha: entry.sha });
      }
    }
  }
  return entries;
}

async function preparePublication(options, repository) {
  const source = path.resolve(options.source);
  const sourceStat = await lstat(source);
  await inspectInputTree(source, "--source");
  if (
    !sourceStat.isDirectory() &&
    !(sourceStat.isFile() && path.extname(source).toLowerCase() === ".html")
  ) {
    throw new Error("--source 必须是 HTML 文件或包含 index.html 的目录。");
  }

  const pagePrefix = `src/pages/${options.slug}`;
  const refPrefix = `references/${options.slug}`;
  const existingPageFiles = repository.entries.filter(
    (entry) => entry.type === "blob" && entry.path.startsWith(`${pagePrefix}/`),
  );
  const existingRefFiles = repository.entries.filter(
    (entry) => entry.type === "blob" && entry.path.startsWith(`${refPrefix}/`),
  );
  const metadataEntry = repository.byPath.get(`${pagePrefix}/page.json`);
  const indexEntry = repository.byPath.get(`${pagePrefix}/index.html`);
  const isUpdate = Boolean(existingPageFiles.length);

  if (isUpdate && (!metadataEntry || !indexEntry)) {
    throw new Error(
      `${options.slug} 的远端页面结构不完整，缺少 index.html 或 page.json。`,
    );
  }
  if (!isUpdate && existingRefFiles.length) {
    throw new Error(`${options.slug} 尚无页面，但远端已存在同名 Ref 目录。`);
  }

  const pageFiles = sourceStat.isDirectory()
    ? await collectFiles(source, pagePrefix)
    : new Map([[`${pagePrefix}/index.html`, source]]);
  if (!pageFiles.has(`${pagePrefix}/index.html`)) {
    throw new Error("--source 目录必须包含 index.html。");
  }

  const refFiles = await collectRefInputs(
    options.ref.map((item) => path.resolve(item)),
    refPrefix,
  );
  const previousMetadata = isUpdate
    ? JSON.parse(
        (
          await options.api.requestRaw(
            `/repos/${OWNER}/${REPO}/git/blobs/${metadataEntry.sha}`,
          )
        ).toString("utf8"),
      )
    : undefined;
  const metadata = {
    slug: options.slug,
    title: options.title,
    description:
      options.description ??
      previousMetadata?.description ??
      options.title,
    publishedAt:
      options.date ??
      previousMetadata?.publishedAt ??
      new Date().toISOString().slice(0, 10),
    tags:
      options.tags === undefined
        ? previousMetadata?.tags ?? []
        : options.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
  };
  const metadataBuffer = Buffer.from(
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
  assertNoSensitiveContent(metadataBuffer, `${pagePrefix}/page.json`);

  const finalRefPaths =
    options.clearRef || options.ref.length
      ? [...refFiles.keys()]
      : existingRefFiles.map((entry) => entry.path);
  await validatePreparedPage({
    slug: options.slug,
    pageFiles,
    metadataBuffer,
    refFiles,
    finalRefPaths,
  });

  const uploads = new Map(pageFiles);
  uploads.set(`${pagePrefix}/page.json`, metadataBuffer);
  if (options.ref.length) {
    for (const [repoPath, localPath] of refFiles) {
      uploads.set(repoPath, localPath);
    }
  }

  const deletions = new Set(
    existingPageFiles
      .map((entry) => entry.path)
      .filter((repoPath) => !uploads.has(repoPath)),
  );
  if (options.clearRef || options.ref.length) {
    for (const entry of existingRefFiles) {
      if (!uploads.has(entry.path)) deletions.add(entry.path);
    }
  }

  return {
    deletions,
    existingRefFiles,
    isUpdate,
    refPrefix,
    uploads,
  };
}

async function validatePreparedPage({
  slug,
  pageFiles,
  metadataBuffer,
  refFiles,
  finalRefPaths,
}) {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "static-page-publish-"),
  );
  try {
    for (const [repoPath, localPath] of pageFiles) {
      const destination = path.join(temporaryRoot, repoPath);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(localPath, destination);
    }
    const metadataPath = path.join(
      temporaryRoot,
      "src",
      "pages",
      slug,
      "page.json",
    );
    await mkdir(path.dirname(metadataPath), { recursive: true });
    await writeFile(metadataPath, metadataBuffer);

    for (const repoPath of finalRefPaths) {
      const destination = path.join(temporaryRoot, repoPath);
      await mkdir(path.dirname(destination), { recursive: true });
      const localPath = refFiles.get(repoPath);
      if (localPath) {
        await cp(localPath, destination);
      } else {
        await writeFile(destination, "");
      }
    }
    await loadAndValidatePages(temporaryRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function publishPrepared({
  api,
  options,
  prepared,
  repository,
}) {
  const treeChanges = [];
  for (const [repoPath, value] of prepared.uploads) {
    const buffer = Buffer.isBuffer(value) ? value : await readFile(value);
    validateFileSize(buffer.length, repoPath);
    assertNoSensitiveContent(buffer, repoPath);
    const current = repository.byPath.get(repoPath);
    if (current?.sha === gitBlobSha(buffer)) continue;
    const encoded = selectBlobEncoding(buffer);
    const blob = await api.request(`/repos/${OWNER}/${REPO}/git/blobs`, {
      method: "POST",
      body: encoded,
    });
    treeChanges.push({
      path: repoPath,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }
  for (const repoPath of prepared.deletions) {
    treeChanges.push({
      path: repoPath,
      mode: "100644",
      type: "blob",
      sha: null,
    });
  }
  if (!treeChanges.length) {
    throw new Error("输入内容与远端完全一致，没有可发布变化。");
  }

  const tree = await api.request(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: "POST",
    body: { base_tree: repository.treeSha, tree: treeChanges },
  });
  const commit = await api.request(`/repos/${OWNER}/${REPO}/git/commits`, {
    method: "POST",
    body: {
      message: `${prepared.isUpdate ? "Update" : "Publish"} ${options.slug}`,
      tree: tree.sha,
      parents: [repository.commitSha],
    },
  });
  const branch = createBranchName(options.slug);
  try {
    await api.request(`/repos/${OWNER}/${REPO}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: commit.sha },
    });
  } catch (createError) {
    const cleanupError = await deletePublicationBranch(api, branch);
    if (cleanupError) {
      throw rollbackError(
        "创建发布分支失败，且无法确认远端是否已回滚",
        branch,
        createError,
        cleanupError,
      );
    }
    throw createError;
  }

  let pullRequest;
  try {
    pullRequest = await api.request(`/repos/${OWNER}/${REPO}/pulls`, {
      method: "POST",
      body: {
        title: `${prepared.isUpdate ? "Update" : "Publish"} ${options.slug}`,
        head: branch,
        base: DEFAULT_BRANCH,
        body:
          `自动发布页面 \`${options.slug}\`。\n\n` +
          "- 页面资源与 metadata 位于独立 slug 目录\n" +
          "- pages.json 将在 CI/Vercel 构建时聚合生成",
      },
    });
  } catch (error) {
    const cleanupError = await deletePublicationBranch(api, branch);
    if (cleanupError) {
      throw rollbackError(
        "PR 创建失败，且发布分支回滚失败",
        branch,
        error,
        cleanupError,
      );
    }
    throw error;
  }

  try {
    await api.graphql(
      `mutation EnableAutoMerge($pullRequestId: ID!) {
        enablePullRequestAutoMerge(input: {
          pullRequestId: $pullRequestId,
          mergeMethod: SQUASH
        }) {
          pullRequest { number }
        }
      }`,
      { pullRequestId: pullRequest.node_id },
    );
  } catch (error) {
    throw new Error(
      `PR 已创建，但无法启用自动合并：${pullRequest.html_url}；${error.message}`,
    );
  }

  return {
    branch,
    commitSha: commit.sha,
    pullRequestUrl: pullRequest.html_url,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validateOptions(options);
  const token = resolveGitHubToken(options.pr);
  if (options.pr && !token) {
    throw new Error(
      "--pr 未找到可用的 GitHub 凭据：请设置 GH_TOKEN/GITHUB_TOKEN，" +
        "或先确保本机 Git 可通过 HTTPS credential helper 访问 github.com。",
    );
  }

  const api = createGitHubClient(token);
  if (options.pr) {
    await verifyRepositoryPrerequisites(api);
  }
  const repository = await readRepositoryState(api);
  const prepared = await preparePublication({ ...options, api }, repository);
  const refCount =
    options.clearRef || options.ref.length
      ? [...prepared.uploads.keys()].filter((repoPath) =>
          repoPath.startsWith(`${prepared.refPrefix}/`),
        ).length
      : prepared.existingRefFiles.length;

  if (options.dryRun) {
    console.log(
      `Dry run 通过：${prepared.isUpdate ? "更新" : "新增"} /${options.slug}/，` +
        `${refCount} 个 Ref 文件；未创建 Blob、分支或 PR。`,
    );
    return;
  }

  const result = await publishPrepared({
    api,
    options,
    prepared,
    repository,
  });
  console.log(`PR 已创建并启用自动合并：${result.pullRequestUrl}`);
  console.log(`分支：${result.branch}`);
  console.log(`提交：${result.commitSha}`);
  console.log(`预期正式页面：${SITE}/${options.slug}/`);
  console.log(`Ref 文件：${refCount}`);
}

async function collectFiles(directory, repoPrefix, relative = "") {
  const files = new Map();
  const entries = await readdir(path.join(directory, relative), {
    withFileTypes: true,
  });
  for (const entry of entries) {
    const childRelative = path.posix.join(relative, entry.name);
    const localPath = path.join(directory, childRelative);
    const repoPath = path.posix.join(repoPrefix, childRelative);
    if (entry.isDirectory()) {
      for (const item of await collectFiles(
        directory,
        repoPrefix,
        childRelative,
      )) {
        files.set(...item);
      }
    } else if (entry.isFile()) {
      files.set(repoPath, localPath);
    } else {
      throw new Error(`输入只允许普通文件和目录：${localPath}`);
    }
  }
  return files;
}

async function collectRefInputs(refs, refPrefix) {
  const topLevelNames = new Set();
  const files = new Map();
  for (const source of refs) {
    await inspectInputTree(source, "--ref");
    const sourceStat = await lstat(source);
    const name = path.basename(source);
    if (topLevelNames.has(name)) {
      throw new Error(`Ref 顶层名称冲突：${name}`);
    }
    topLevelNames.add(name);
    if (sourceStat.isDirectory()) {
      for (const item of await collectFiles(
        source,
        path.posix.join(refPrefix, name),
      )) {
        files.set(...item);
      }
    } else {
      files.set(path.posix.join(refPrefix, name), source);
    }
  }
  return files;
}

async function inspectInputTree(target, label) {
  const targetStat = await lstat(target);
  if (targetStat.isSymbolicLink()) {
    throw new Error(`${label} 不得包含符号链接：${target}`);
  }
  if (!targetStat.isFile() && !targetStat.isDirectory()) {
    throw new Error(`${label} 只允许普通文件和目录：${target}`);
  }
  if (targetStat.isFile()) {
    validateFileSize(targetStat.size, target);
    await inspectSensitiveFile(target, label);
    return;
  }
  for (const entry of await readdir(target)) {
    await inspectInputTree(path.join(target, entry), label);
  }
}

async function inspectSensitiveFile(file, label) {
  const name = path.basename(file).toLowerCase();
  if (
    name === ".env" ||
    name.startsWith(".env.") ||
    name === ".npmrc" ||
    name === "credentials" ||
    name === "credentials.json" ||
    name === "cookies.txt" ||
    /^id_(?:rsa|dsa|ecdsa|ed25519)$/.test(name) ||
    name.endsWith(".key")
  ) {
    throw new Error(`${label} 包含危险文件名：${file}`);
  }

  assertNoSensitiveContent(await readFile(file), `${label} 文件 ${file}`);
}

function createBranchName(slug) {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `publish/${slug}-${timestamp}-${randomBytes(3).toString("hex")}`;
}

function encodeRef(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

async function deletePublicationBranch(api, branch) {
  try {
    await api.request(
      `/repos/${OWNER}/${REPO}/git/refs/heads/${encodeRef(branch)}`,
      { method: "DELETE" },
    );
    return undefined;
  } catch (error) {
    if (error.status === 404) return undefined;
    return error;
  }
}

function rollbackError(message, branch, primaryError, cleanupError) {
  return new AggregateError(
    [primaryError, cleanupError],
    `${message}：${branch}。原始错误：${primaryError.message}；` +
      `清理错误：${cleanupError.message}。请在 GitHub 检查并删除该分支。`,
  );
}

function usage(message) {
  throw new Error(
    `${message}\n用法：npm run publish:page -- --source <HTML或目录> --slug <slug> --title <标题> ` +
      "[--description <简介>] [--tags <标签1,标签2>] [--date <YYYY-MM-DD>] " +
      "[--ref <文件或目录> ...] [--clear-ref] (--dry-run|--pr)",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
