import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function loadAndValidatePages(rootDir) {
  const registryPath = path.join(rootDir, "pages.json");
  const raw = await readFile(registryPath, "utf8");
  const pages = JSON.parse(raw);

  if (!Array.isArray(pages)) {
    throw new Error("pages.json 必须是数组。");
  }

  const slugs = new Set();

  for (const [index, page] of pages.entries()) {
    const label = `pages.json 第 ${index + 1} 项`;

    if (!page || typeof page !== "object" || Array.isArray(page)) {
      throw new Error(`${label} 必须是对象。`);
    }
    if (!SLUG_PATTERN.test(page.slug ?? "")) {
      throw new Error(`${label} 的 slug 无效：${page.slug ?? ""}`);
    }
    if (slugs.has(page.slug)) {
      throw new Error(`slug 重复：${page.slug}`);
    }
    slugs.add(page.slug);

    for (const field of ["title", "description", "file"]) {
      if (typeof page[field] !== "string" || !page[field].trim()) {
        throw new Error(`${label} 缺少有效的 ${field}。`);
      }
    }
    if (!DATE_PATTERN.test(page.publishedAt ?? "")) {
      throw new Error(`${label} 的 publishedAt 必须使用 YYYY-MM-DD。`);
    }
    if (
      !Array.isArray(page.tags) ||
      page.tags.some((tag) => typeof tag !== "string" || !tag.trim())
    ) {
      throw new Error(`${label} 的 tags 必须是字符串数组。`);
    }
    const expectedFile = path.posix.join(
      "src/pages",
      page.slug,
      "index.html",
    );
    if (page.file !== expectedFile) {
      throw new Error(
        `${label} 的 file 应为 ${expectedFile}，实际为 ${page.file}。`,
      );
    }

    await access(path.join(rootDir, page.file));
    await validateLocalReferences(rootDir, page);
    await validateHtmlRefSection(rootDir, page);
  }

  return pages;
}

async function validateLocalReferences(rootDir, page) {
  const htmlPath = path.join(rootDir, page.file);
  const html = await readFile(htmlPath, "utf8");
  const pageDir = path.dirname(htmlPath);
  const references = [
    ...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi),
  ].map((match) => match[1].trim());

  for (const reference of references) {
    if (
      !reference ||
      reference.startsWith("#") ||
      reference.startsWith("/") ||
      reference.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(reference)
    ) {
      continue;
    }

    const relativePath = reference.split(/[?#]/, 1)[0];
    if (!relativePath) continue;

    try {
      await access(path.resolve(pageDir, relativePath));
    } catch {
      throw new Error(`${page.slug} 引用了缺失资源：${reference}`);
    }
  }
}

async function validateHtmlRefSection(rootDir, page) {
  const html = await readFile(path.join(rootDir, page.file), "utf8");
  const sectionMatch = html.match(
    /<section\b[^>]*\bid=["']ref["'][^>]*>([\s\S]*?)<\/section>/i,
  );

  if (!sectionMatch) {
    throw new Error(`${page.slug} 的源 HTML 缺少 <section id="ref">。`);
  }

  const githubRawBase =
    "https://raw.githubusercontent.com/Koilato/StaticWebPage/main/";
  const links = [
    ...sectionMatch[1].matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi),
  ].map((match) => match[1].trim());

  for (const link of links) {
    if (!link.startsWith(githubRawBase)) {
      throw new Error(`${page.slug} 的 Ref 链接没有使用 GitHub Raw：${link}`);
    }

    const encodedFile = link.slice(githubRawBase.length).split(/[?#]/, 1)[0];
    const file = decodeURIComponent(encodedFile);
    const expectedPrefix = `references/${page.slug}/`;
    if (
      path.posix.normalize(file) !== file ||
      !file.startsWith(expectedPrefix)
    ) {
      throw new Error(
        `${page.slug} 的 Ref 文件必须位于 ${expectedPrefix}：${file}`,
      );
    }

    const fileStat = await stat(path.join(rootDir, file));
    if (!fileStat.isFile()) {
      throw new Error(`${page.slug} 的 Ref 链接不是文件：${file}`);
    }
  }
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
