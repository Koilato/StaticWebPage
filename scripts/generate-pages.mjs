import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAndValidatePages } from "./site-utils.mjs";

export async function generatePages(rootDir) {
  const pages = await loadAndValidatePages(rootDir);
  await writeFile(
    path.join(rootDir, "pages.json"),
    `${JSON.stringify(pages, null, 2)}\n`,
    "utf8",
  );
  return pages;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const pages = await generatePages(rootDir);
  console.log(`索引生成完成：pages.json 包含 ${pages.length} 个页面。`);
}
