import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(process.argv[2] ?? process.cwd());

await requirePath("pages.json");
await requirePath("package.json");
await requirePath("vercel.json");
await requirePath("src/pages");
await requirePath("references");

const packageJson = await readJson("package.json");
const vercelJson = await readJson("vercel.json");

requireEqual(packageJson.scripts?.build, "node scripts/build.mjs", "build 脚本");
requireEqual(
  packageJson.scripts?.validate,
  "node scripts/validate.mjs",
  "validate 脚本",
);
requireEqual(
  packageJson.scripts?.check,
  "npm run test && npm run validate && npm run build",
  "check 脚本",
);
requireEqual(
  packageJson.scripts?.test,
  "node --test scripts/site-utils.test.mjs",
  "test 脚本",
);
requireEqual(
  packageJson.scripts?.["publish:page"],
  "node .agents/skills/publish-static-pages/scripts/publish-page.mjs",
  "publish:page 脚本",
);
requireEqual(vercelJson.buildCommand, "npm run build", "Vercel buildCommand");
requireEqual(vercelJson.outputDirectory, "dist", "Vercel outputDirectory");

const branch = run("git", ["branch", "--show-current"]).trim();
requireEqual(branch, "main", "当前 Git 分支");

const remote = run("git", ["remote", "get-url", "origin"]).trim();
requireEqual(
  remote,
  "https://github.com/Koilato/StaticWebPage.git",
  "Git origin",
);

run("npm", ["run", "check"], true);

const pages = await readJson("pages.json");
for (const page of pages) {
  const source = await readFile(path.join(repoRoot, page.file));
  const output = await readFile(
    path.join(repoRoot, "dist", page.slug, "index.html"),
  );
  if (!source.equals(output)) {
    throw new Error(
      `${page.slug} 的构建结果与源 HTML 不一致；构建脚本不得修改 Ref。`,
    );
  }
}

try {
  await access(path.join(repoRoot, "dist", "references"));
  throw new Error("dist/references 不得存在；Ref 文件不能进入 Vercel 构建。");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

console.log(`发布前检查通过：${pages.length} 个页面，Vercel 自动构建配置有效。`);

async function requirePath(relativePath) {
  await access(path.join(repoRoot, relativePath));
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} 必须为 ${expected}，实际为 ${actual ?? "未设置"}。`);
  }
}

function run(command, args, inherit = false) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} 执行失败：${result.stderr?.trim() ?? ""}`,
    );
  }
  return result.stdout ?? "";
}
