import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertGeneratedFilesUntracked,
  checkGeneratedFiles,
} from "./check-generated-files.mjs";

test("pages.json 或 dist 被跟踪时失败", () => {
  assert.doesNotThrow(() => assertGeneratedFilesUntracked(""));
  assert.throws(
    () => assertGeneratedFilesUntracked("pages.json\ndist/index.html\n"),
    /构建产物不得被 Git 跟踪：pages.json, dist\/index.html/,
  );
});

test("只有从 Git 索引移除生成物后检查才通过", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "generated-check-test-"));
  try {
    runGit(root, ["init", "-q"]);
    runGit(root, ["config", "user.name", "Test"]);
    runGit(root, ["config", "user.email", "test@example.com"]);
    await writeFile(path.join(root, "pages.json"), "[]\n");
    runGit(root, ["add", "pages.json"]);
    runGit(root, ["commit", "-qm", "track generated file"]);
    await unlink(path.join(root, "pages.json"));
    assert.throws(
      () => checkGeneratedFiles(root),
      /构建产物不得被 Git 跟踪：pages.json/,
    );
    runGit(root, ["add", "-u", "--", "pages.json"]);
    assert.doesNotThrow(() => checkGeneratedFiles(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
