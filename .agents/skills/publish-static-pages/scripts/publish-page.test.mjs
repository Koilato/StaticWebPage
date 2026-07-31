import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseArgs,
  preparePublication,
  publishPrepared,
  readRepositoryState,
  selectBlobEncoding,
  validateFileSize,
  validateOptions,
  verifyRepositoryPrerequisites,
} from "./publish-page.mjs";

test("CLI 只接受 dry-run 或 pr，且 clear-ref 与 ref 互斥", () => {
  const parsed = parseArgs([
    "--source",
    "page.html",
    "--slug",
    "demo-page",
    "--title",
    "Demo",
    "--pr",
  ]);
  assert.equal(parsed.pr, true);
  assert.equal(parsed.dryRun, false);
  assert.doesNotThrow(() => validateOptions(parsed));
  assert.throws(
    () =>
      validateOptions({
        ...parsed,
        ref: ["manual.pdf"],
        clearRef: true,
      }),
    /不得与 --ref 同时使用/,
  );
  assert.throws(() => parseArgs(["--push"]), /未知参数：--push/);
});

test("文本 Blob 使用 UTF-8，二进制 Blob 使用 Base64", () => {
  assert.deepEqual(selectBlobEncoding(Buffer.from("你好")), {
    content: "你好",
    encoding: "utf-8",
  });
  assert.deepEqual(selectBlobEncoding(Buffer.from([0, 255, 1])), {
    content: "AP8B",
    encoding: "base64",
  });
});

test("文件大小超过 50 MiB 警告，超过 100 MiB 拒绝", () => {
  const warnings = [];
  validateFileSize(50 * 1024 * 1024 + 1, "large.bin", (message) =>
    warnings.push(message),
  );
  assert.equal(warnings.length, 1);
  assert.throws(
    () => validateFileSize(100 * 1024 * 1024 + 1, "huge.bin"),
    /超过 100 MiB/,
  );
});

test("Tree 递归结果截断时逐层读取子树", async () => {
  const requests = [];
  const api = {
    async request(apiPath) {
      requests.push(apiPath);
      if (apiPath.includes("/git/ref/")) {
        return { object: { sha: "commit-main" } };
      }
      if (apiPath.endsWith("/git/commits/commit-main")) {
        return { tree: { sha: "tree-root" } };
      }
      if (apiPath.endsWith("/git/trees/tree-root?recursive=1")) {
        return { truncated: true, tree: [] };
      }
      if (apiPath.endsWith("/git/trees/tree-root")) {
        return {
          tree: [
            { path: "README.md", type: "blob", sha: "readme" },
            { path: "src", type: "tree", sha: "tree-src" },
          ],
        };
      }
      if (apiPath.endsWith("/git/trees/tree-src")) {
        return {
          tree: [{ path: "index.html", type: "blob", sha: "page" }],
        };
      }
      throw new Error(`未预期请求：${apiPath}`);
    },
  };
  const state = await readRepositoryState(api);
  assert.deepEqual(
    state.entries.map((entry) => entry.path),
    ["README.md", "src", "src/index.html"],
  );
  assert.ok(requests.some((item) => item.endsWith("/git/trees/tree-src")));
});

test("Tree 逐层读取仍被截断时停止发布", async () => {
  const api = {
    async request(apiPath) {
      if (apiPath.includes("/git/ref/")) {
        return { object: { sha: "commit-main" } };
      }
      if (apiPath.endsWith("/git/commits/commit-main")) {
        return { tree: { sha: "tree-root" } };
      }
      if (apiPath.endsWith("/git/trees/tree-root?recursive=1")) {
        return { truncated: true, tree: [] };
      }
      if (apiPath.endsWith("/git/trees/tree-root")) {
        return { truncated: true, tree: [] };
      }
      throw new Error(`未预期请求：${apiPath}`);
    },
  };
  await assert.rejects(readRepositoryState(api), /逐层读取仍被截断/);
});

test("发布前验证 main ruleset、必需检查和自动合并设置", async () => {
  const validApi = prerequisiteApi();
  await assert.doesNotReject(verifyRepositoryPrerequisites(validApi));
  const invalidApi = prerequisiteApi({
    repository: { allow_auto_merge: false },
    rules: [],
  });
  await assert.rejects(
    verifyRepositoryPrerequisites(invalidApi),
    /未要求通过 PR 合并.*未把 publish-check 设为必需检查.*未启用 auto-merge/,
  );
  await assert.rejects(
    verifyRepositoryPrerequisites(
      prerequisiteApi({ workflows: { workflows: [] } }),
    ),
    /缺少 \.github\/workflows\/publish-check\.yml/,
  );
  for (const integrationId of [null, 999]) {
    await assert.rejects(
      verifyRepositoryPrerequisites(prerequisiteApi({ integrationId })),
      /publish-check 的来源不是 GitHub Actions/,
    );
  }
});

test("新增页面只上传独立页面目录和 metadata", async () => {
  await withSource(async ({ root, source }) => {
    const options = baseOptions(source);
    const prepared = await preparePublication(options, emptyRepository());
    assert.equal(prepared.isUpdate, false);
    assert.deepEqual([...prepared.deletions], []);
    assert.deepEqual([...prepared.uploads.keys()].sort(), [
      "src/pages/demo-page/index.html",
      "src/pages/demo-page/page.json",
    ]);
    assert.equal(prepared.metadata.description, "Demo");
  });
});

test("更新页面省略 ref 时保留附件，并删除旧页面资源", async () => {
  await withSource(async ({ source }) => {
    const rawUrl =
      "https://raw.githubusercontent.com/Koilato/StaticWebPage/main/" +
      "references/demo-page/manual.pdf";
    await writeFile(
      path.join(source, "index.html"),
      `<main><section><h1>Demo</h1></section><section id="ref"><ul><li><a href="${rawUrl}" target="_blank" rel="noopener noreferrer">manual.pdf</a><p>说明</p></li></ul></section></main>`,
    );
    const repository = repositoryWithPage();
    const options = baseOptions(source, {
      api: metadataApi(),
    });
    const prepared = await preparePublication(options, repository);
    assert.equal(prepared.isUpdate, true);
    assert.ok(
      prepared.deletions.has("src/pages/demo-page/assets/old.css"),
    );
    assert.ok(!prepared.deletions.has("references/demo-page/manual.pdf"));
    assert.ok(!prepared.uploads.has("references/demo-page/manual.pdf"));
    assert.equal(prepared.metadata.publishedAt, "2026-07-28");
  });
});

test("更新页面传入 ref 时全量替换旧附件", async () => {
  await withSource(async ({ root, source }) => {
    const newRef = path.join(root, "new.pdf");
    await writeFile(newRef, Buffer.from([0, 1, 2]));
    const rawUrl =
      "https://raw.githubusercontent.com/Koilato/StaticWebPage/main/" +
      "references/demo-page/new.pdf";
    await writeFile(
      path.join(source, "index.html"),
      `<main><section><h1>Demo</h1></section><section id="ref"><ul><li><a href="${rawUrl}" target="_blank" rel="noopener noreferrer">new.pdf</a><p>新附件</p></li></ul></section></main>`,
    );
    const options = baseOptions(source, {
      api: metadataApi(),
      ref: [newRef],
    });
    const prepared = await preparePublication(options, repositoryWithPage());
    assert.ok(prepared.deletions.has("references/demo-page/manual.pdf"));
    assert.ok(prepared.uploads.has("references/demo-page/new.pdf"));
  });
});

test("更新页面使用 clear-ref 时删除全部旧附件", async () => {
  await withSource(async ({ source }) => {
    const options = baseOptions(source, {
      api: metadataApi(),
      clearRef: true,
    });
    const prepared = await preparePublication(options, repositoryWithPage());
    assert.ok(prepared.deletions.has("references/demo-page/manual.pdf"));
    assert.ok(
      ![...prepared.uploads.keys()].some((repoPath) =>
        repoPath.startsWith("references/"),
      ),
    );
  });
});

test("输入目录包含敏感文件时拒绝发布", async () => {
  await withSource(async ({ source }) => {
    await writeFile(path.join(source, ".env"), "TOKEN=secret");
    await assert.rejects(
      preparePublication(baseOptions(source), emptyRepository()),
      /包含危险文件名/,
    );
  });
});

test("输入内容包含 GitHub token 时拒绝发布", async () => {
  await withSource(async ({ source }) => {
    const token = ["github", "pat", "A".repeat(24)].join("_");
    await writeFile(
      path.join(source, "index.html"),
      `<main><script>const token="${token}"</script><section id="ref"><p>暂无关联文件。</p></section></main>`,
    );
    await assert.rejects(
      preparePublication(baseOptions(source), emptyRepository()),
      /疑似GitHub 令牌/,
    );
  });
});

test("无引号 Cookie 和密码赋值时拒绝发布", async () => {
  for (const credential of [
    "Cookie: sessionid=abcdefgh1234567890",
    "password=supersecret123",
  ]) {
    await withSource(async ({ source }) => {
      await writeFile(
        path.join(source, "index.html"),
        `<main><pre>${credential}</pre><section id="ref"><p>暂无关联文件。</p></section></main>`,
      );
      await assert.rejects(
        preparePublication(baseOptions(source), emptyRepository()),
        /疑似(?:Cookie|密码或访问密钥)/,
      );
    });
  }
});

test("文件 64 KiB 之后包含私钥标记时拒绝发布", async () => {
  await withSource(async ({ source }) => {
    const marker = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
    await writeFile(
      path.join(source, "index.html"),
      `${"x".repeat(70 * 1024)}${marker}`,
    );
    await assert.rejects(
      preparePublication(baseOptions(source), emptyRepository()),
      /疑似私钥/,
    );
  });
});

test("发布按 Blob、Tree、Commit、Branch、PR、Auto-merge 顺序执行", async () => {
  const calls = [];
  const api = {
    async request(apiPath, options = {}) {
      calls.push([apiPath, options.method ?? "GET"]);
      if (apiPath.endsWith("/git/blobs")) return { sha: "blob-new" };
      if (apiPath.endsWith("/git/trees")) return { sha: "tree-new" };
      if (apiPath.endsWith("/git/commits")) return { sha: "commit-new" };
      if (apiPath.endsWith("/git/refs")) return {};
      if (apiPath.endsWith("/pulls")) {
        return {
          node_id: "PR_node",
          number: 7,
          html_url: "https://github.com/Koilato/StaticWebPage/pull/7",
        };
      }
      throw new Error(`未预期请求：${apiPath}`);
    },
    async graphql() {
      calls.push(["/graphql", "POST"]);
      return { enablePullRequestAutoMerge: { pullRequest: { number: 7 } } };
    },
  };
  const repository = emptyRepository();
  const prepared = {
    deletions: new Set(),
    isUpdate: false,
    uploads: new Map([
      ["src/pages/demo-page/index.html", Buffer.from("<main></main>")],
    ]),
  };
  const result = await publishPrepared({
    api,
    options: { slug: "demo-page" },
    prepared,
    repository,
  });
  assert.equal(result.pullRequestNumber, 7);
  assert.deepEqual(
    calls.map(([apiPath]) => apiPath.split("/").at(-1)),
    ["blobs", "trees", "commits", "refs", "pulls", "graphql"],
  );
});

test("PR 创建失败时删除本次创建的分支", async () => {
  const calls = [];
  const api = {
    async request(apiPath) {
      calls.push(apiPath);
      if (apiPath.endsWith("/git/blobs")) return { sha: "blob-new" };
      if (apiPath.endsWith("/git/trees")) return { sha: "tree-new" };
      if (apiPath.endsWith("/git/commits")) return { sha: "commit-new" };
      if (apiPath.endsWith("/git/refs")) return {};
      if (apiPath.endsWith("/pulls")) throw new Error("PR 创建失败");
      if (apiPath.includes("/git/refs/heads/publish/")) return {};
      throw new Error(`未预期请求：${apiPath}`);
    },
  };
  await assert.rejects(
    publishPrepared({
      api,
      options: { slug: "demo-page" },
      prepared: {
        deletions: new Set(),
        isUpdate: false,
        uploads: new Map([
          ["src/pages/demo-page/index.html", Buffer.from("<main></main>")],
        ]),
      },
      repository: emptyRepository(),
    }),
    /PR 创建失败/,
  );
  assert.ok(
    calls.some((apiPath) => apiPath.includes("/git/refs/heads/publish/")),
  );
});

test("PR 创建与分支回滚同时失败时报告残留分支", async () => {
  const api = {
    async request(apiPath) {
      if (apiPath.endsWith("/git/blobs")) return { sha: "blob-new" };
      if (apiPath.endsWith("/git/trees")) return { sha: "tree-new" };
      if (apiPath.endsWith("/git/commits")) return { sha: "commit-new" };
      if (apiPath.endsWith("/git/refs")) return {};
      if (apiPath.endsWith("/pulls")) throw new Error("primary PR failure");
      if (apiPath.includes("/git/refs/heads/publish/")) {
        throw new Error("cleanup failure");
      }
      throw new Error(`未预期请求：${apiPath}`);
    },
  };
  await assert.rejects(
    publishPrepared({
      api,
      options: { slug: "demo-page" },
      prepared: {
        deletions: new Set(),
        isUpdate: false,
        uploads: new Map([
          ["src/pages/demo-page/index.html", Buffer.from("<main></main>")],
        ]),
      },
      repository: emptyRepository(),
    }),
    /发布分支回滚失败.*primary PR failure.*cleanup failure.*GitHub 检查并删除/,
  );
});

test("分支创建响应失败时尝试删除不确定分支", async () => {
  for (const cleanup of ["success", "not-found", "failure"]) {
    const calls = [];
    const api = {
      async request(apiPath, options = {}) {
        calls.push([apiPath, options.method]);
        if (apiPath.endsWith("/git/blobs")) return { sha: "blob-new" };
        if (apiPath.endsWith("/git/trees")) return { sha: "tree-new" };
        if (apiPath.endsWith("/git/commits")) return { sha: "commit-new" };
        if (apiPath.endsWith("/git/refs")) {
          throw new Error("branch response lost");
        }
        if (apiPath.includes("/git/refs/heads/publish/")) {
          if (cleanup === "success") return {};
          const error = new Error(
            cleanup === "not-found" ? "branch absent" : "delete failed",
          );
          if (cleanup === "not-found") error.status = 404;
          throw error;
        }
        throw new Error(`未预期请求：${apiPath}`);
      },
    };
    const promise = publishPrepared({
      api,
      options: { slug: "demo-page" },
      prepared: {
        deletions: new Set(),
        isUpdate: false,
        uploads: new Map([
          ["src/pages/demo-page/index.html", Buffer.from("<main></main>")],
        ]),
      },
      repository: emptyRepository(),
    });
    if (cleanup === "failure") {
      await assert.rejects(
        promise,
        /无法确认远端是否已回滚.*branch response lost.*delete failed/,
      );
    } else {
      await assert.rejects(promise, /branch response lost/);
    }
    assert.ok(
      calls.some(
        ([apiPath, method]) =>
          apiPath.includes("/git/refs/heads/publish/") &&
          method === "DELETE",
      ),
    );
  }
});

function baseOptions(source, overrides = {}) {
  return {
    source,
    slug: "demo-page",
    title: "Demo",
    description: undefined,
    tags: undefined,
    date: undefined,
    ref: [],
    clearRef: false,
    api: {
      async requestRaw() {
        throw new Error("新增页面不应读取 metadata");
      },
    },
    ...overrides,
  };
}

function emptyRepository() {
  return {
    commitSha: "commit-main",
    treeSha: "tree-main",
    entries: [],
    byPath: new Map(),
  };
}

function repositoryWithPage() {
  const entries = [
    {
      path: "src/pages/demo-page/index.html",
      type: "blob",
      sha: "old-index",
    },
    {
      path: "src/pages/demo-page/page.json",
      type: "blob",
      sha: "old-metadata",
    },
    {
      path: "src/pages/demo-page/assets/old.css",
      type: "blob",
      sha: "old-css",
    },
    {
      path: "references/demo-page/manual.pdf",
      type: "blob",
      sha: "old-ref",
    },
  ];
  return {
    commitSha: "commit-main",
    treeSha: "tree-main",
    entries,
    byPath: new Map(entries.map((entry) => [entry.path, entry])),
  };
}

function metadataApi() {
  return {
    async requestRaw() {
      return Buffer.from(
        JSON.stringify({
          slug: "demo-page",
          title: "Old",
          description: "Old description",
          publishedAt: "2026-07-28",
          tags: ["old"],
        }),
      );
    },
  };
}

function prerequisiteApi(overrides = {}) {
  const repository = {
    allow_auto_merge: true,
    allow_squash_merge: true,
    delete_branch_on_merge: true,
    ...overrides.repository,
  };
  const branch = { protected: true, ...overrides.branch };
  const integrationId = Object.hasOwn(overrides, "integrationId")
    ? overrides.integrationId
    : 15368;
  const rules =
    overrides.rules ??
    [
      {
        type: "pull_request",
        parameters: { allowed_merge_methods: ["squash"] },
      },
      {
        type: "required_status_checks",
        parameters: {
          required_status_checks: [
            { context: "publish-check", integration_id: integrationId },
          ],
        },
      },
    ];
  const workflows = overrides.workflows ?? {
    workflows: [
      {
        path: ".github/workflows/publish-check.yml",
        state: "active",
      },
    ],
  };
  return {
    async request(apiPath) {
      if (apiPath.endsWith("/branches/main")) return branch;
      if (apiPath.includes("/rules/branches/main")) return rules;
      if (apiPath.includes("/actions/workflows")) return workflows;
      if (apiPath.endsWith("/repos/Koilato/StaticWebPage")) return repository;
      throw new Error(`未预期请求：${apiPath}`);
    },
  };
}

async function withSource(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "publisher-test-"));
  const source = path.join(root, "source");
  try {
    await mkdir(source);
    await writeFile(
      path.join(source, "index.html"),
      '<main><section><h1>Demo</h1></section><section id="ref"><p>暂无关联文件。</p></section></main>',
    );
    await run({ root, source });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
