import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function assertGeneratedFilesUntracked(trackedFiles) {
  const tracked = trackedFiles
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  if (tracked.length) {
    throw new Error(
      `构建产物不得被 Git 跟踪：${tracked.join(", ")}。` +
        "请从索引移除 pages.json 和 dist/。",
    );
  }
}

export function checkGeneratedFiles(rootDir) {
  const result = spawnSync(
    "git",
    ["ls-files", "--", "pages.json", "dist"],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(`无法检查 Git 跟踪状态：${result.stderr?.trim() ?? ""}`);
  }
  assertGeneratedFilesUntracked(result.stdout ?? "");
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  checkGeneratedFiles(rootDir);
  console.log("构建产物跟踪检查通过：pages.json 和 dist/ 均未入库。");
}
