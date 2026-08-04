import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAndValidatePages } from "./site-utils.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = await loadAndValidatePages(rootDir);

console.log(
  `验证通过：${pages.length} 个页面，slug、页面资源和 HTML Ref 均有效。`,
);
