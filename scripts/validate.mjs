import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAndValidatePages } from "./site-utils.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = await loadAndValidatePages(rootDir);

console.log(`验证通过：${pages.length} 个页面，slug 和本地资源均有效。`);
