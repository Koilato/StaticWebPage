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
    if (!Array.isArray(page.references)) {
      throw new Error(`${label} 的 references 必须是数组。`);
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
    await validateDownloadReferences(rootDir, page, label);
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

async function validateDownloadReferences(rootDir, page, label) {
  const files = new Set();
  const expectedPrefix = `references/${page.slug}/`;

  for (const [index, reference] of page.references.entries()) {
    const referenceLabel = `${label} 的第 ${index + 1} 个 reference`;

    if (
      !reference ||
      typeof reference !== "object" ||
      Array.isArray(reference)
    ) {
      throw new Error(`${referenceLabel} 必须是对象。`);
    }
    for (const field of ["title", "description", "file"]) {
      if (
        typeof reference[field] !== "string" ||
        !reference[field].trim()
      ) {
        throw new Error(`${referenceLabel} 缺少有效的 ${field}。`);
      }
    }

    const normalizedFile = path.posix.normalize(reference.file);
    if (
      normalizedFile !== reference.file ||
      !reference.file.startsWith(expectedPrefix)
    ) {
      throw new Error(
        `${referenceLabel} 的 file 必须位于 ${expectedPrefix} 下。`,
      );
    }
    if (files.has(reference.file)) {
      throw new Error(`${referenceLabel} 重复使用文件：${reference.file}`);
    }
    files.add(reference.file);

    const fileStat = await stat(path.join(rootDir, reference.file));
    if (!fileStat.isFile()) {
      throw new Error(`${referenceLabel} 不是文件：${reference.file}`);
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
