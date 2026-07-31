import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function loadAndValidatePages(rootDir) {
  const pagesRoot = path.join(rootDir, "src", "pages");
  const directories = (await readdir(pagesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const pages = [];

  for (const directory of directories) {
    const page = JSON.parse(
      await readFile(path.join(pagesRoot, directory, "page.json"), "utf8"),
    );
    if (!SLUG_PATTERN.test(page.slug) || page.slug !== directory) {
      throw new Error(`页面 ${directory} 的 slug 无效。`);
    }
    if (!page.title?.trim() || !page.description?.trim()) {
      throw new Error(`页面 ${directory} 缺少标题或简介。`);
    }
    if (!DATE_PATTERN.test(page.publishedAt)) {
      throw new Error(`页面 ${directory} 的日期无效。`);
    }
    if (
      !Array.isArray(page.tags) ||
      page.tags.some((tag) => typeof tag !== "string")
    ) {
      throw new Error(`页面 ${directory} 的 tags 必须是字符串数组。`);
    }

    const file = path.posix.join("src/pages", directory, "index.html");
    await access(path.join(rootDir, file));
    await validatePageFiles(rootDir, { slug: directory, file });
    pages.push({
      slug: directory,
      title: page.title,
      description: page.description,
      publishedAt: page.publishedAt,
      tags: page.tags,
      file,
    });
  }

  return pages.sort(
    (left, right) =>
      right.publishedAt.localeCompare(left.publishedAt) ||
      left.slug.localeCompare(right.slug),
  );
}

async function validatePageFiles(rootDir, page) {
  const htmlPath = path.join(rootDir, page.file);
  const html = await readFile(htmlPath, "utf8");
  const mainStarts = [...html.matchAll(/<main\b[^>]*>/gi)];
  const mainEnds = [...html.matchAll(/<\/main\s*>/gi)];
  const refSections = [
    ...html.matchAll(
      /<section\b[^>]*\bid=["']ref["'][^>]*>([\s\S]*?)<\/section>/gi,
    ),
  ];
  if (
    mainStarts.length !== 1 ||
    mainEnds.length !== 1 ||
    refSections.length !== 1
  ) {
    throw new Error(`${page.slug} 必须包含唯一的 main 和 section#ref。`);
  }

  const mainEnd = mainEnds[0].index;
  const ref = refSections[0];
  const laterSection = [...html.matchAll(/<section\b[^>]*>/gi)].some(
    (match) => match.index > ref.index && match.index < mainEnd,
  );
  if (
    ref.index < mainStarts[0].index ||
    ref.index + ref[0].length > mainEnd ||
    laterSection
  ) {
    throw new Error(`${page.slug} 的 section#ref 必须是 main 内最后一个 section。`);
  }

  for (const match of html.matchAll(
    /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi,
  )) {
    const value = match[1].trim();
    if (
      !value ||
      value.startsWith("#") ||
      value.startsWith("/") ||
      value.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(value)
    ) {
      continue;
    }
    const relative = value.split(/[?#]/, 1)[0];
    if (relative) await access(path.resolve(path.dirname(htmlPath), relative));
  }

  const files = await listFiles(path.join(rootDir, "references", page.slug));
  const prefix =
    `https://raw.githubusercontent.com/Koilato/StaticWebPage/main/` +
    `references/${page.slug}/`;
  const expected = new Set(
    files.map(
      (file) =>
        `${prefix}${file.split("/").map(encodeURIComponent).join("/")}`,
    ),
  );
  const links = [...ref[1].matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map(
    (match) => match[1].trim(),
  );
  const actual = new Set(links);
  if (
    links.length !== actual.size ||
    expected.size !== actual.size ||
    [...expected].some((value) => !actual.has(value))
  ) {
    throw new Error(`${page.slug} 的 Ref 链接与附件不一致。`);
  }
}

async function listFiles(directory, prefix = "") {
  let entries;
  try {
    entries = await readdir(path.join(directory, prefix), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(directory, relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
