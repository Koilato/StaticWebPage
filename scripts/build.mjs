// 从 Node.js 内置的 Promise 版文件系统模块中导入复制、建目录、删除和写文件函数。
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
// 导入 Node.js 内置的路径处理模块；它只计算路径字符串，不直接读写文件。
import path from "node:path";
// 导入“文件 URL 转本机路径”函数，用于处理 import.meta.url。
import { fileURLToPath } from "node:url";
import { generatePages } from "./generate-pages.mjs";
// 从项目自定义模块导入 HTML 转义函数。
import { escapeHtml } from "./site-utils.mjs";

// import.meta.url 是当前脚本的 file: URL；转为本机路径并取父目录，得到仓库根目录。
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 所有构建产物统一写入仓库根目录下的 dist。
const distDir = path.join(rootDir, "dist");
// 允许部署环境覆盖站点域名，并去掉末尾斜杠，避免拼接 URL 时产生双斜杠。
const siteUrl = (process.env.SITE_URL ?? "https://static-web-page-pied.vercel.app")
  .replace(/\/+$/, "");
// 聚合并校验分散的 page.json，同时生成统一 pages.json。
const pages = await generatePages(rootDir);

// 删除旧 dist，创建空 dist。recursive 允许删除整个目录，force 使目录不存在时也不报错。
await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

// 逐个复制页面目录：源目录来自 page.file，目标目录名使用稳定的 page.slug。
for (const page of pages) {
  const sourceDir = path.dirname(path.join(rootDir, page.file));
  await cp(sourceDir, path.join(distDir, page.slug), { recursive: true });
}

// 根据页面配置生成站点目录首页和 sitemap，并以 UTF-8 写入 dist。
await writeFile(path.join(distDir, "index.html"), renderIndex(pages), "utf8");
await writeFile(path.join(distDir, "sitemap.xml"), renderSitemap(pages), "utf8");

// 输出构建摘要，便于本地或 CI 日志确认生成的页面数量。
console.log(`构建完成：dist/ 包含首页、站点地图和 ${pages.length} 个页面。`);

// 根据页面数组生成完整的目录首页 HTML 字符串。
/**
 * 将已校验的页面配置渲染为站点目录首页。
 * @param {Array<object>} entries 页面配置列表。
 * @returns {string} 可直接写入文件的完整 HTML。
 */
function renderIndex(entries) {
  // map 把每个页面对象转换为一张 HTML 卡片；join 把所有卡片连接成一个字符串。
  const cards = entries
    .map((page) => {
      // 合并标题、简介和标签，作为不区分字段的搜索文本。
      const searchable = [
        page.title,
        page.description,
        page.tags.join(" "),
      ].join(" ");
      // 把每个标签转换为 <span>；escapeHtml 防止数据被解释为 HTML 代码。
      const tags = page.tags
        .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
        .join("");

      // 返回当前页面对应的卡片 HTML；${...} 用于插入经过转义的数据。
      return `<article class="card" data-search="${escapeHtml(searchable.toLowerCase())}">
        <div class="meta"><time datetime="${escapeHtml(page.publishedAt)}">${escapeHtml(page.publishedAt)}</time></div>
        <h2><a href="/${escapeHtml(page.slug)}/">${escapeHtml(page.title)}</a></h2>
        <p>${escapeHtml(page.description)}</p>
        <div class="tags">${tags}</div>
      </article>`;
    })
    .join("\n");

  // 返回完整 HTML。其中的 <style> 是页面样式，<script> 是浏览器端搜索逻辑。
  // 搜索脚本读取预先转为小写的 data-search，并通过 hidden 属性筛选卡片。
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="静态页面集合站">
  <title>StaticWebPage · 页面目录</title>
  <style>
    :root { color-scheme: light; --bg:#f5f7f4; --paper:#fff; --ink:#18211c; --muted:#677169; --line:#dce3de; --accent:#196b49; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:radial-gradient(circle at 10% 0,#e5f1e9 0,transparent 34rem),var(--bg); font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; }
    .shell { width:min(1040px,calc(100% - 32px)); margin:0 auto; }
    header { padding:72px 0 34px; }
    .eyebrow { color:var(--accent); font-size:13px; font-weight:750; letter-spacing:.08em; text-transform:uppercase; }
    h1 { margin:10px 0 14px; font-size:clamp(40px,7vw,72px); line-height:1; letter-spacing:-.045em; }
    header p { max-width:650px; margin:0; color:var(--muted); font-size:18px; }
    .search { width:100%; margin:28px 0 24px; padding:15px 17px; border:1px solid var(--line); border-radius:14px; background:rgba(255,255,255,.9); color:var(--ink); font:inherit; box-shadow:0 10px 30px rgba(28,53,40,.07); }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:18px; padding-bottom:70px; }
    .card { padding:24px; border:1px solid var(--line); border-radius:18px; background:var(--paper); box-shadow:0 12px 35px rgba(28,53,40,.06); }
    .card h2 { margin:8px 0 10px; line-height:1.25; }
    .card a { color:inherit; text-decoration:none; }
    .card a:hover { color:var(--accent); }
    .card p,.meta { color:var(--muted); }
    .card p { margin:0 0 18px; }
    .meta { font-size:13px; }
    .tags { display:flex; flex-wrap:wrap; gap:7px; }
    .tag { padding:4px 9px; border-radius:999px; background:#e8f3ec; color:var(--accent); font-size:12px; font-weight:650; }
    .empty { display:none; color:var(--muted); }
  </style>
</head>
<body>
  <header class="shell">
    <div class="eyebrow">StaticWebPage</div>
    <h1>页面目录</h1>
    <p>集中保存和发布独立静态页面。每个页面拥有稳定链接，并随 main 分支自动更新。</p>
    <input class="search" id="search" type="search" placeholder="搜索标题、简介或标签…" aria-label="搜索页面">
  </header>
  <main class="shell">
    <div class="grid" id="pages">${cards}</div>
    <p class="empty" id="empty">没有匹配的页面。</p>
  </main>
  <script>
    const input = document.querySelector("#search");
    const cards = [...document.querySelectorAll(".card")];
    const empty = document.querySelector("#empty");
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      let visible = 0;
      for (const card of cards) {
        const show = card.dataset.search.includes(query);
        card.hidden = !show;
        if (show) visible += 1;
      }
      empty.style.display = visible ? "none" : "block";
    });
  </script>
</body>
</html>
`;
}

// 根据页面数组生成 sitemap.xml 字符串，供搜索引擎发现站点页面。
/**
 * 将已校验的页面配置渲染为站点地图。
 * @param {Array<object>} entries 页面配置列表。
 * @returns {string} 可直接写入文件的 sitemap XML。
 */
function renderSitemap(entries) {
  const urls = [
    // 首页 URL。
    `<url><loc>${escapeHtml(siteUrl)}/</loc></url>`,
    // ... 把 map 生成的页面 URL 数组展开，并追加到当前数组。
    ...entries.map(
      (page) =>
        `<url><loc>${escapeHtml(siteUrl)}/${escapeHtml(page.slug)}/</loc><lastmod>${escapeHtml(page.publishedAt)}</lastmod></url>`,
    ),
    // sitemap 的所有 <url> 节点之间不需要分隔符。
  ].join("");

  // 把所有 URL 节点包在 sitemap 标准要求的 <urlset> 根节点中。
  // URL、slug 和日期均先经 escapeHtml 处理，避免特殊字符破坏 XML 结构。
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>
`;
}
