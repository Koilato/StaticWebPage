import { access, readFile, readdir, stat } from "node:fs/promises";
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
  const allowedFields = new Set([
    "slug",
    "title",
    "description",
    "file",
    "publishedAt",
    "tags",
  ]);

  for (const [index, page] of pages.entries()) {
    const label = `pages.json 第 ${index + 1} 项`;

    if (!page || typeof page !== "object" || Array.isArray(page)) {
      throw new Error(`${label} 必须是对象。`);
    }
    const extraFields = Object.keys(page).filter(
      (field) => !allowedFields.has(field),
    );
    if (extraFields.length) {
      throw new Error(`${label} 包含未允许字段：${extraFields.join(", ")}`);
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
      page.tags.some((tag) => typeof tag !== "string" || !tag.trim()) ||
      new Set(page.tags).size !== page.tags.length
    ) {
      throw new Error(`${label} 的 tags 必须是无重复项的字符串数组。`);
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
  const refMatches = [
    ...html.matchAll(
      /<section\b[^>]*\bid=["']ref["'][^>]*>([\s\S]*?)<\/section>/gi,
    ),
  ];

  if (refMatches.length !== 1) {
    throw new Error(
      `${page.slug} 的源 HTML 必须且只能有一个 <section id="ref">。`,
    );
  }

  const sectionMatch = refMatches[0];
  const mainStarts = [...html.matchAll(/<main\b[^>]*>/gi)];
  const mainEnds = [...html.matchAll(/<\/main\s*>/gi)];
  if (mainStarts.length !== 1 || mainEnds.length !== 1) {
    throw new Error(`${page.slug} 的源 HTML 必须且只能有一个完整 <main>。`);
  }
  const mainStart = mainStarts[0].index;
  const mainEnd = html.toLowerCase().lastIndexOf("</main>");
  const laterSection = [
    ...html.matchAll(/<section\b[^>]*>/gi),
  ].some((match) => match.index > sectionMatch.index && match.index < mainEnd);
  if (
    sectionMatch.index < mainStart ||
    sectionMatch.index > mainEnd ||
    laterSection
  ) {
    throw new Error(`${page.slug} 的 Ref 必须是 </main> 前的最后一个 section。`);
  }

  const githubRawBase =
    "https://raw.githubusercontent.com/Koilato/StaticWebPage/main/";
  const referenceDir = path.join(rootDir, "references", page.slug);
  const referenceFiles = await listReferenceFiles(referenceDir);
  const expectedLinks = new Map(
    referenceFiles.map((file) => [
      `${githubRawBase}references/${page.slug}/${encodePath(file)}`,
      file,
    ]),
  );
  const listItems = [
    ...sectionMatch[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi),
  ];
  const links = [];

  for (const itemMatch of listItems) {
    const item = itemMatch[1];
    const anchors = [
      ...item.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi),
    ];
    if (anchors.length !== 1) {
      throw new Error(`${page.slug} 的每个 Ref 条目必须且只能包含一个链接。`);
    }

    const attributes = anchors[0][1];
    const link = readHtmlAttribute(attributes, "href");
    const target = readHtmlAttribute(attributes, "target");
    const rel = readHtmlAttribute(attributes, "rel");
    const label = stripHtml(anchors[0][2]);
    const descriptions = [
      ...item.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi),
    ].map((match) => stripHtml(match[1]));

    if (!link || !label) {
      throw new Error(`${page.slug} 的每个 Ref 条目必须有链接和显示名称。`);
    }
    if (target !== "_blank" || !relTokensInclude(rel, ["noopener", "noreferrer"])) {
      throw new Error(
        `${page.slug} 的 Ref 链接必须设置 target="_blank" 和 rel="noopener noreferrer"。`,
      );
    }
    if (!descriptions.some(Boolean)) {
      throw new Error(`${page.slug} 的每个 Ref 条目必须有非空用途说明。`);
    }
    links.push(link);
  }

  const allSectionLinks = [
    ...sectionMatch[1].matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi),
  ].map((match) => match[1].trim());
  if (
    allSectionLinks.length !== links.length ||
    allSectionLinks.some((link, index) => link !== links[index])
  ) {
    throw new Error(`${page.slug} 的 Ref 链接必须分别放在独立的 <li> 中。`);
  }

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

  const duplicateLinks = links.filter(
    (link, index) => links.indexOf(link) !== index,
  );
  if (duplicateLinks.length) {
    throw new Error(
      `${page.slug} 的 Ref 存在重复链接：${[...new Set(duplicateLinks)].join(", ")}`,
    );
  }

  const linkedFiles = new Set(links);
  const missingLinks = [...expectedLinks.entries()]
    .filter(([link]) => !linkedFiles.has(link))
    .map(([, file]) => file);
  const extraLinks = links.filter((link) => !expectedLinks.has(link));
  if (missingLinks.length) {
    throw new Error(
      `${page.slug} 的 Ref 未链接以下附件：${missingLinks.join(", ")}`,
    );
  }
  if (extraLinks.length) {
    throw new Error(
      `${page.slug} 的 Ref 包含未登记附件链接：${extraLinks.join(", ")}`,
    );
  }
  if (referenceFiles.length === 0 && !stripHtml(sectionMatch[1]).includes("暂无关联文件")) {
    throw new Error(`${page.slug} 没有附件时，Ref 必须明确写“暂无关联文件”。`);
  }
}

async function listReferenceFiles(referenceDir, prefix = "") {
  let entries;
  try {
    entries = await readdir(path.join(referenceDir, prefix), {
      withFileTypes: true,
    });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listReferenceFiles(referenceDir, relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`Ref 目录只允许普通文件和目录：${relative}`);
    }
  }
  return files.sort();
}

function readHtmlAttribute(attributes, name) {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"),
  );
  return match?.[1]?.trim() ?? "";
}

function relTokensInclude(value, required) {
  const tokens = new Set(value.toLowerCase().split(/\s+/).filter(Boolean));
  return required.every((token) => tokens.has(token));
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function encodePath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
