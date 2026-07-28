import { spawnSync } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = "https://github.com/Koilato/StaticWebPage.git";
const SITE = "https://static-web-page-pied.vercel.app";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VERIFY_ATTEMPTS = positiveInteger(
  process.env.PUBLISH_VERIFY_ATTEMPTS ?? "24",
  "PUBLISH_VERIFY_ATTEMPTS",
);
const VERIFY_INTERVAL_MS = positiveInteger(
  process.env.PUBLISH_VERIFY_INTERVAL_MS ?? "5000",
  "PUBLISH_VERIFY_INTERVAL_MS",
);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const options = parseArgs(process.argv.slice(2));
const createdPaths = [];
let originalRegistry;
let committed = false;
let stagedByScript = false;

try {
  validateOptions(options);
  verifyRepository();

  const source = path.resolve(options.source);
  const refs = options.ref.map((item) => path.resolve(item));
  const pages = JSON.parse(
    await readFile(path.join(repoRoot, "pages.json"), "utf8"),
  );
  if (!Array.isArray(pages)) {
    throw new Error("pages.json 必须是数组。");
  }
  if (pages.some((page) => page.slug === options.slug)) {
    throw new Error(`slug 已存在，不支持更新已有页面：${options.slug}`);
  }

  const pageDestination = path.join(
    repoRoot,
    "src",
    "pages",
    options.slug,
  );
  const refDestination = path.join(repoRoot, "references", options.slug);
  await requireMissing(pageDestination);
  await requireMissing(refDestination);

  const sourceStat = await lstat(source);
  await inspectInputTree(source, "--source");
  if (
    !sourceStat.isDirectory() &&
    !(sourceStat.isFile() && path.extname(source).toLowerCase() === ".html")
  ) {
    throw new Error("--source 必须是 HTML 文件或包含 index.html 的目录。");
  }
  if (sourceStat.isDirectory()) {
    const indexStat = await lstat(path.join(source, "index.html"));
    if (!indexStat.isFile()) {
      throw new Error("--source 目录必须包含 index.html。");
    }
  }

  const refInputs = await inspectRefs(refs);
  createdPaths.push(pageDestination);
  await mkdir(pageDestination);
  if (sourceStat.isDirectory()) {
    await cp(source, pageDestination, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  } else {
    await cp(source, path.join(pageDestination, "index.html"), {
      force: false,
      errorOnExist: true,
    });
  }

  if (refInputs.length) {
    createdPaths.push(refDestination);
    await mkdir(refDestination);
    for (const input of refInputs) {
      await cp(input.source, path.join(refDestination, input.name), {
        recursive: input.isDirectory,
        force: false,
        errorOnExist: true,
      });
    }
  }

  const registryPath = path.join(repoRoot, "pages.json");
  originalRegistry = await readFile(registryPath, "utf8");
  const entry = {
    slug: options.slug,
    title: options.title,
    description: options.description ?? options.title,
    file: `src/pages/${options.slug}/index.html`,
    publishedAt: options.date ?? new Date().toISOString().slice(0, 10),
    tags: (options.tags ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
  await writeFile(
    registryPath,
    `${JSON.stringify([...pages, entry], null, 2)}\n`,
    "utf8",
  );

  run("npm", ["run", "publish:check"], true);

  if (options.dryRun) {
    console.log(
      `Dry run 通过：/${options.slug}/，${await countFiles(refDestination)} 个 Ref 文件；未提交或推送。`,
    );
  } else {
    const allowed = [
      "pages.json",
      `src/pages/${options.slug}`,
      ...(refInputs.length ? [`references/${options.slug}`] : []),
    ];
    stagedByScript = true;
    run("git", ["add", "--", ...allowed]);
    await verifyStagedFiles(
      options.slug,
      pageDestination,
      refDestination,
      refInputs.length > 0,
    );
    run("git", ["diff", "--cached", "--check"]);
    run("git", ["commit", "-m", `Publish ${options.slug}`], true);
    committed = true;
    const commit = run("git", ["rev-parse", "HEAD"]).trim();
    run("git", ["push", "origin", "main"], true);

    const refFiles = refInputs.length
      ? await listFiles(refDestination)
      : [];
    await verifyPublished(options.slug, pageDestination, refDestination, refFiles);
    console.log(`发布完成：${SITE}/${options.slug}/`);
    console.log(`提交：${commit}`);
    console.log(`Ref 文件：${refFiles.length}`);
  }
} catch (error) {
  if (!committed) {
    await cleanup();
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (options.dryRun && !committed) {
    await cleanup();
  }
}

function parseArgs(args) {
  const result = { ref: [], dryRun: false, push: false };
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
    if (argument === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (argument === "--push") {
      result.push = true;
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

function validateOptions(value) {
  for (const required of ["source", "slug", "title"]) {
    if (!value[required]) usage(`缺少 --${required}。`);
  }
  if (value.dryRun === value.push) {
    usage("必须且只能指定 --dry-run 或 --push。");
  }
  if (!SLUG_PATTERN.test(value.slug)) {
    usage(`slug 无效：${value.slug}`);
  }
  if (value.date && !DATE_PATTERN.test(value.date)) {
    usage("--date 必须使用 YYYY-MM-DD。");
  }
}

function verifyRepository() {
  if (run("git", ["status", "--porcelain", "--untracked-files=all"])) {
    throw new Error("工作树不干净；发布前请提交、移走或清理现有改动。");
  }
  requireEqual(run("git", ["branch", "--show-current"]).trim(), "main", "当前分支");
  requireEqual(
    run("git", ["remote", "get-url", "origin"]).trim(),
    ORIGIN,
    "origin",
  );
  run("git", ["fetch", "--quiet", "origin", "main"]);
  const head = run("git", ["rev-parse", "HEAD"]).trim();
  const remoteHead = run("git", ["rev-parse", "refs/remotes/origin/main"]).trim();
  if (head !== remoteHead) {
    throw new Error("本地 main 与 origin/main 不同步；请先完成同步。");
  }
}

async function inspectRefs(refs) {
  const names = new Set();
  const inputs = [];
  for (const source of refs) {
    const sourceStat = await lstat(source);
    await inspectInputTree(source, "--ref");
    if (!sourceStat.isFile() && !sourceStat.isDirectory()) {
      throw new Error(`--ref 必须是文件或目录：${source}`);
    }
    const name = path.basename(source);
    if (names.has(name)) {
      throw new Error(`Ref 顶层名称冲突：${name}`);
    }
    names.add(name);
    inputs.push({ source, name, isDirectory: sourceStat.isDirectory() });
  }
  return inputs;
}

async function verifyStagedFiles(
  slug,
  pageDirectory,
  refDirectory,
  hasRefs,
) {
  const staged = run("git", [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
  ])
    .trim()
    .split("\n")
    .filter(Boolean);
  if (!staged.includes("pages.json")) {
    throw new Error("暂存区缺少 pages.json。");
  }
  if (!staged.includes(`src/pages/${slug}/index.html`)) {
    throw new Error("暂存区缺少页面 index.html。");
  }
  const expected = new Set([
    "pages.json",
    ...(await listFiles(pageDirectory)).map(
      (file) => `src/pages/${slug}/${file}`,
    ),
    ...(hasRefs
      ? (await listFiles(refDirectory)).map(
          (file) => `references/${slug}/${file}`,
        )
      : []),
  ]);
  const actual = new Set(staged);
  const missing = [...expected].filter((file) => !actual.has(file));
  const extra = [...actual].filter((file) => !expected.has(file));
  if (missing.length || extra.length) {
    throw new Error(
      [
        missing.length ? `未暂存：${missing.join(", ")}` : "",
        extra.length ? `白名单外：${extra.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("；"),
    );
  }
}

async function verifyPublished(slug, pageDirectory, refDirectory, refFiles) {
  const expectedPage = await readFile(path.join(pageDirectory, "index.html"));
  const pageAssets = (await listFiles(pageDirectory)).filter(
    (file) => file !== "index.html",
  );
  const checks = [
    {
      label: "Vercel 目录首页",
      url: `${SITE}/`,
      expected: readFile(path.join(repoRoot, "dist", "index.html")),
    },
    {
      label: "Vercel 页面",
      url: `${SITE}/${slug}/`,
      expected: expectedPage,
    },
    ...pageAssets.map((file) => ({
      label: `Vercel 页面资源 ${file}`,
      url: `${SITE}/${slug}/${encodePath(file)}`,
      expected: readFile(path.join(pageDirectory, file)),
    })),
    ...refFiles.map((file) => ({
      label: `GitHub Raw ${file}`,
      url:
        `https://raw.githubusercontent.com/Koilato/StaticWebPage/main/` +
        `references/${slug}/${encodePath(file)}`,
      expected: readFile(path.join(refDirectory, file)),
    })),
  ];

  for (const check of checks) {
    check.expected = await check.expected;
  }
  let lastError;
  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
    try {
      for (const check of checks) {
        const separator = check.url.includes("?") ? "&" : "?";
        const response = await fetch(`${check.url}${separator}publish=${Date.now()}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          throw new Error(`${check.label} 返回 HTTP ${response.status}`);
        }
        const actual = Buffer.from(await response.arrayBuffer());
        if (!actual.equals(check.expected)) {
          throw new Error(`${check.label} 内容尚未更新`);
        }
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < VERIFY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, VERIFY_INTERVAL_MS));
      }
    }
  }
  throw new Error(`线上验证失败：${lastError?.message ?? "未知错误"}`);
}

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(path.join(directory, prefix), {
    withFileTypes: true,
  })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(directory, relative)));
    } else if (entry.isFile()) {
      files.push(relative);
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

  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const sample = buffer.subarray(0, bytesRead).toString("utf8");
    if (
      /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/.test(sample)
    ) {
      throw new Error(`${label} 包含私钥标记：${file}`);
    }
  } finally {
    await handle.close();
  }
}

async function countFiles(directory) {
  try {
    return (await listFiles(directory)).length;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
}

async function cleanup() {
  let registryRestored = false;
  if (stagedByScript) {
    run("git", [
      "restore",
      "--staged",
      "--",
      "pages.json",
      `src/pages/${options.slug ?? "__invalid__"}`,
      `references/${options.slug ?? "__invalid__"}`,
    ], false, true);
    stagedByScript = false;
  }
  if (originalRegistry !== undefined) {
    await writeFile(path.join(repoRoot, "pages.json"), originalRegistry, "utf8");
    originalRegistry = undefined;
    registryRestored = true;
  }
  while (createdPaths.length) {
    await rm(createdPaths.pop(), { recursive: true, force: true });
  }
  if (registryRestored) {
    run("npm", ["run", "build"], true, true);
  }
}

async function requireMissing(target) {
  try {
    await stat(target);
    throw new Error(`目标路径已存在：${target}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function encodePath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} 必须为 ${expected}，实际为 ${actual || "未设置"}。`);
  }
}

function positiveInteger(raw, label) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} 必须是正整数。`);
  }
  return value;
}

function run(command, args, inherit = false, allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `${command} ${args.join(" ")} 执行失败：${result.stderr?.trim() ?? ""}`,
    );
  }
  return result.stdout ?? "";
}

function usage(message) {
  throw new Error(
    `${message}\n用法：npm run publish:page -- --source <HTML或目录> --slug <slug> --title <标题> ` +
      "[--description <简介>] [--tags <标签1,标签2>] [--date <YYYY-MM-DD>] " +
      "[--ref <文件或目录> ...] (--dry-run|--push)",
  );
}
