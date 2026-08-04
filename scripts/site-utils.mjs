import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

// slug 仅允许小写字母、数字及单个连字符分隔的片段；日期仅校验固定格式。
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 读取页面登记表，并校验元数据、页面文件、本地资源及 Ref 附件的一致性。
 *
 * @param {string} rootDir 仓库根目录
 * @returns {Promise<object[]>} 校验通过的页面登记项
 */
export async function loadAndValidatePages(rootDir) {
  const pagesRoot = path.join(rootDir, "src", "pages");
  const directories = (await readdir(pagesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const pages = [];
  const slugs = new Set();
  const allowedFields = new Set([
    "slug",
    "title",
    "description",
    "publishedAt",
    "tags",
  ]);

  for (const directory of directories) {
    const metadataPath = path.join(pagesRoot, directory, "page.json");
    let page;
    try {
      page = JSON.parse(await readFile(metadataPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(`页面 ${directory} 缺少 page.json。`);
      }
      if (error instanceof SyntaxError) {
        throw new Error(`页面 ${directory} 的 page.json 不是有效 JSON。`);
      }
      throw error;
    }
    const label = `页面 ${directory} 的 page.json`;

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
    if (page.slug !== directory) {
      throw new Error(`${label} 的 slug 必须与目录名一致：${directory}`);
    }

    for (const field of ["title", "description"]) {
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
    const normalized = {
      ...page,
      file: path.posix.join("src/pages", page.slug, "index.html"),
    };
    await access(path.join(rootDir, normalized.file));
    await validateLocalReferences(rootDir, normalized);
    await validateHtmlRefSection(rootDir, normalized);
    pages.push(normalized);
  }

  return pages.sort(
    (left, right) =>
      right.publishedAt.localeCompare(left.publishedAt) ||
      left.slug.localeCompare(right.slug),
  );
}

/**
 * 校验页面中相对路径形式的 src/href 是否指向实际存在的本地资源。
 *
 * @param {string} rootDir 仓库根目录
 * @param {object} page 页面登记项
 * @returns {Promise<void>}
 */
async function validateLocalReferences(rootDir, page) {
  const htmlPath = path.join(rootDir, page.file);
  const html = await readFile(htmlPath, "utf8");
  const pageDir = path.dirname(htmlPath);
  const references = [
    ...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi),
  ].map((match) => match[1].trim());

  for (const reference of references) {
    // 锚点、站内绝对路径、协议相对地址和带 URI scheme 的地址不属于本地相对资源。
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

/**
 * 校验 Ref 区块的位置、条目结构，以及链接与附件目录之间的一一对应关系。
 *
 * @param {string} rootDir 仓库根目录
 * @param {object} page 页面登记项
 * @returns {Promise<void>}
 */
async function validateHtmlRefSection(rootDir, page) {
  const html = await readFile(path.join(rootDir, page.file), "utf8");
  // [\s\S] 用于跨行匹配区块内容，避免依赖 dotAll 标志。
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
  // Map 同时保留预期 Raw 链接与原始相对文件名，便于报告遗漏附件。
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
  // Ref 区块内不得出现游离链接；每个 href 都必须来自已验证的独立 <li>。
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

/**
 * 递归列出 Ref 目录中的普通文件，并返回稳定排序的 POSIX 相对路径。
 *
 * @param {string} referenceDir Ref 根目录
 * @param {string} [prefix=""] 当前递归层级的相对路径
 * @returns {Promise<string[]>}
 */
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

/**
 * 从 HTML 属性文本中读取指定的单双引号属性值。
 *
 * @param {string} attributes 属性文本
 * @param {string} name 属性名
 * @returns {string} 去除首尾空白后的属性值；不存在时返回空字符串
 */
function readHtmlAttribute(attributes, name) {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"),
  );
  return match?.[1]?.trim() ?? "";
}

/**
 * 判断 rel 属性是否包含全部必需 token，忽略大小写及空白数量。
 *
 * @param {string} value rel 属性值
 * @param {string[]} required 必需 token
 * @returns {boolean}
 */
function relTokensInclude(value, required) {
  const tokens = new Set(value.toLowerCase().split(/\s+/).filter(Boolean));
  return required.every((token) => tokens.has(token));
}

/**
 * 去除简单 HTML 标签并折叠空白，用于判断展示文本是否为空。
 *
 * @param {string} value HTML 片段
 * @returns {string}
 */
function stripHtml(value) {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * 对路径的每一段分别进行 URI 编码，同时保留目录分隔符。
 *
 * @param {string} value POSIX 相对路径
 * @returns {string}
 */
function encodePath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

/**
 * 转义插入 HTML 文本或属性值时可能改变文档结构的字符。
 *
 * @param {unknown} value 待转义值
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
