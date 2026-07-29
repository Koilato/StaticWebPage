/**
 * 新页面发布入口：校验本地输入与仓库状态，写入页面登记，执行预检，
 * 并按显式模式选择仅演练回滚，或提交并推送。
 */
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

// 固定发布目标。
const ORIGIN = "https://github.com/Koilato/StaticWebPage.git";
const SITE = "https://static-web-page-pied.vercel.app";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const options = parseArgs(process.argv.slice(2));

// 记录本次运行产生的可回滚状态；提交成功后不再自动撤销。
const createdPaths = [];
let originalRegistry;
let committed = false;
let stagedByScript = false;

try {
  // 阶段一：拒绝歧义参数、脏工作树、错误远端或不同步的 main。
  validateOptions(options);
  verifyRepository();

  // 阶段二：检查来源树安全性及目标唯一性，避免覆盖已有页面。
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

  // 阶段三：复制页面与 Ref，并以可恢复方式追加 pages.json 登记。
  // 复制页面
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
  //复制 Ref
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
  // 追加 pages.json
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

  // 阶段四：统一通过仓库预检验证登记、页面、资源与构建产物。
  run("npm", ["run", "publish:check"], true);

  if (options.dryRun) {
    console.log(
      `Dry run 通过：/${options.slug}/，${await countFiles(refDestination)} 个 Ref 文件；未提交或推送。`,
    );
  } else {
    // 仅暂存本次 slug 的白名单路径，随后复核暂存区再提交与推送。
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

    const refFileCount = await countFiles(refDestination);
    console.log(`推送完成；Vercel 页面：${SITE}/${options.slug}/`);
    console.log(`提交：${commit}`);
    console.log(`Ref 文件：${refFileCount}`);
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

/**
 * 将 CLI 参数解析为发布选项。
 * `--ref` 可重复，其余带值参数只能出现一次；模式开关仅记录不裁决。
 *
 * @param {string[]} args `process.argv` 中的用户参数。
 * @returns {Record<string, any>} 规范化后的发布选项。
 */

//函数在这里被调用const options = parseArgs(process.argv.slice(2));

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

/**
 * 校验必填字段、互斥运行模式以及 slug/日期格式。
 *
 * @param {Record<string, any>} value 已解析的发布选项。
 * @throws {Error} 参数不完整、模式不唯一或格式非法时抛出。
 */
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

/**
 * 确认发布发生在干净、同步且指向指定 origin 的 main 分支。
 *
 * @throws {Error} 仓库状态不满足安全发布前提时抛出。
 */
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

/**
 * 检查 Ref 输入树，并生成不会发生顶层名称覆盖的复制清单。
 *
 * @param {string[]} refs Ref 文件或目录的绝对路径。
 * @returns {Promise<Array<{source: string, name: string, isDirectory: boolean}>>}
 * @throws {Error} 输入类型非法、含危险内容或顶层名称冲突时抛出。
 */
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

/**
 * 验证暂存区恰好包含登记文件及本次页面/Ref 的全部文件。
 *
 * @param {string} slug 页面稳定标识。
 * @param {string} pageDirectory 页面目录。
 * @param {string} refDirectory Ref 目录。
 * @param {boolean} hasRefs 是否预期存在 Ref。
 * @returns {Promise<void>}
 * @throws {Error} 暂存文件缺失或超出白名单时抛出。
 */
async function verifyStagedFiles(
  slug,
  pageDirectory,
  refDirectory,
  hasRefs,
) {
  // 已存储的文件
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
  //预期存储的文件
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

/**
 * 递归列出目录中的普通文件，并返回 POSIX 风格相对路径。
 *
 * @param {string} directory 根目录。
 * @param {string} [prefix=""] 当前递归前缀。
 * @returns {Promise<string[]>}
 */
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

/**
 * 递归检查输入树，只允许普通文件/目录，并拒绝符号链接和敏感文件。
 *
 * @param {string} target 待检查路径。
 * @param {string} label 用于错误定位的 CLI 参数名。
 * @returns {Promise<void>}
 */
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

/**
 * 以文件名规则和文件头采样识别常见凭据、Cookie 与私钥。
 *
 * @param {string} file 待检查文件。
 * @param {string} label 用于错误定位的 CLI 参数名。
 * @returns {Promise<void>}
 */
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

/**
 * 统计目录内普通文件；目录不存在视为零个 Ref。
 *
 * @param {string} directory 待统计目录。
 * @returns {Promise<number>}
 */
async function countFiles(directory) {
  try {
    return (await listFiles(directory)).length;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
}

/**
 * 在提交前失败或演练结束时，撤销本脚本暂存与落盘的所有变更。
 * 恢复 pages.json 后重新构建，避免 dist 遗留演练产物。
 *
 * @returns {Promise<void>}
 */
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

/**
 * 要求发布目标尚不存在，确保新增流程不会覆盖历史内容。
 *
 * @param {string} target 预期不存在的路径。
 * @returns {Promise<void>}
 */
async function requireMissing(target) {
  try {
    await stat(target);
    throw new Error(`目标路径已存在：${target}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

/**
 * 断言仓库配置值与发布要求完全一致。
 *
 * @param {string} actual 实际值。
 * @param {string} expected 期望值。
 * @param {string} label 配置项名称。
 */
function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} 必须为 ${expected}，实际为 ${actual || "未设置"}。`);
  }
}

/**
 * 在仓库根目录同步执行命令，并统一处理输出继承与失败策略。
 *
 * @param {string} command 可执行命令。
 * @param {string[]} args 命令参数。
 * @param {boolean} [inherit=false] 是否把子进程输出直接交给当前终端。
 * @param {boolean} [allowFailure=false] 是否容忍非零退出码。
 * @returns {string} 捕获到的标准输出；继承输出时通常为空。
 */
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

/**
 * 以统一用法说明终止 CLI 参数处理。
 *
 * @param {string} message 具体参数错误。
 * @throws {Error} 始终抛出。
 */
function usage(message) {
  throw new Error(
    `${message}\n用法：npm run publish:page -- --source <HTML或目录> --slug <slug> --title <标题> ` +
      "[--description <简介>] [--tags <标签1,标签2>] [--date <YYYY-MM-DD>] " +
      "[--ref <文件或目录> ...] (--dry-run|--push)",
  );
}
