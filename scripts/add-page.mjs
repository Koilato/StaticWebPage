import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAndValidatePages } from "./site-utils.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArgs(process.argv.slice(2));

for (const required of ["source", "slug", "title"]) {
  if (!options[required]) {
    fail(`缺少 --${required}。`);
  }
}

const pages = await loadAndValidatePages(rootDir);
if (pages.some((page) => page.slug === options.slug)) {
  fail(`slug 已存在：${options.slug}`);
}

const source = path.resolve(options.source);
const destination = path.join(rootDir, "src", "pages", options.slug);
const sourceStat = await stat(source);

await mkdir(destination, { recursive: false });

try {
  if (sourceStat.isDirectory()) {
    await cp(source, destination, { recursive: true, force: false });
  } else if (sourceStat.isFile() && path.extname(source).toLowerCase() === ".html") {
    await cp(source, path.join(destination, "index.html"), { force: false });
  } else {
    fail("--source 必须是 HTML 文件或包含 index.html 的目录。");
  }

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
  const registryPath = path.join(rootDir, "pages.json");
  const originalRegistry = await readFile(registryPath, "utf8");

  await writeFile(
    registryPath,
    `${JSON.stringify([...pages, entry], null, 2)}\n`,
    "utf8",
  );

  try {
    await loadAndValidatePages(rootDir);
  } catch (error) {
    await writeFile(registryPath, originalRegistry, "utf8");
    throw error;
  }

  console.log(`已添加页面：/${options.slug}/`);
} catch (error) {
  await rm(destination, { recursive: true, force: true });
  throw error;
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail(`参数格式无效：${key ?? ""}`);
    }
    result[key.slice(2)] = value;
  }
  return result;
}

function fail(message) {
  console.error(
    `${message}\n用法：npm run add-page -- --source <文件或目录> --slug <slug> --title <标题> [--description <简介>] [--tags <标签1,标签2>] [--date <YYYY-MM-DD>]`,
  );
  process.exit(1);
}
