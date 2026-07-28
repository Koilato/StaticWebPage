import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml, loadAndValidatePages } from "./site-utils.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const siteUrl = (process.env.SITE_URL ?? "https://static-web-page-pied.vercel.app")
  .replace(/\/+$/, "");
const pages = await loadAndValidatePages(rootDir);

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const page of pages) {
  const sourceDir = path.dirname(path.join(rootDir, page.file));
  await cp(sourceDir, path.join(distDir, page.slug), { recursive: true });
}

await writeFile(path.join(distDir, "index.html"), renderIndex(pages), "utf8");
await writeFile(path.join(distDir, "sitemap.xml"), renderSitemap(pages), "utf8");

console.log(`构建完成：dist/ 包含首页、站点地图和 ${pages.length} 个页面。`);

function renderIndex(entries) {
  const cards = entries
    .map((page) => {
      const searchable = [
        page.title,
        page.description,
        page.tags.join(" "),
      ].join(" ");
      const tags = page.tags
        .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
        .join("");

      return `<article class="card" data-search="${escapeHtml(searchable.toLowerCase())}">
        <div class="meta"><time datetime="${escapeHtml(page.publishedAt)}">${escapeHtml(page.publishedAt)}</time></div>
        <h2><a href="/${escapeHtml(page.slug)}/">${escapeHtml(page.title)}</a></h2>
        <p>${escapeHtml(page.description)}</p>
        <div class="tags">${tags}</div>
      </article>`;
    })
    .join("\n");

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

function renderSitemap(entries) {
  const urls = [
    `<url><loc>${escapeHtml(siteUrl)}/</loc></url>`,
    ...entries.map(
      (page) =>
        `<url><loc>${escapeHtml(siteUrl)}/${escapeHtml(page.slug)}/</loc><lastmod>${escapeHtml(page.publishedAt)}</lastmod></url>`,
    ),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>
`;
}
