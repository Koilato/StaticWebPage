import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadAndValidatePages } from "./site-utils.mjs";

// 固定测试页面标识与预期 Raw 前缀，确保用例只关注 Ref 规则本身。
const slug = "acceptance-page";
const rawBase =
  "https://raw.githubusercontent.com/Koilato/StaticWebPage/main/" +
  `references/${slug}/`;

// 正向基线：实际附件与页面中的名称、说明、链接应完整且一一对应。
test("两个附件均有名称、说明和唯一 Raw 链接时通过", async () => {
  await withFixture(refHtml([refItem("manual.pdf"), refItem("data.csv")]), async (root) => {
    assert.equal((await loadAndValidatePages(root)).length, 1);
  });
});

// 反向用例覆盖附件漏链、重复链接、空说明及非 GitHub Raw 地址。
test("附件漏链时失败", async () => {
  await withFixture(refHtml([refItem("manual.pdf")]), async (root) => {
    await assert.rejects(loadAndValidatePages(root), /未链接以下附件：data\.csv/);
  });
});

test("附件链接重复时失败", async () => {
  await withFixture(
    refHtml([refItem("manual.pdf"), refItem("manual.pdf"), refItem("data.csv")]),
    async (root) => {
      await assert.rejects(loadAndValidatePages(root), /存在重复链接/);
    },
  );
});

test("附件用途说明为空时失败", async () => {
  await withFixture(
    refHtml([refItem("manual.pdf"), refItem("data.csv", "")]),
    async (root) => {
      await assert.rejects(loadAndValidatePages(root), /必须有非空用途说明/);
    },
  );
});

test("错误 Raw URL 时失败", async () => {
  const wrong = refItem("data.csv").replace(
    "raw.githubusercontent.com/Koilato",
    "static-web-page-pied.vercel.app/Koilato",
  );
  await withFixture(refHtml([refItem("manual.pdf"), wrong]), async (root) => {
    await assert.rejects(loadAndValidatePages(root), /没有使用 GitHub Raw/);
  });
});

// 无附件页面必须显式声明，避免把遗漏附件误判为合法状态。
test("没有附件且明确写暂无关联文件时通过", async () => {
  await withFixture(
    '<section id="ref"><h2>Ref</h2><p>暂无关联文件。</p></section>',
    async (root) => {
      assert.equal((await loadAndValidatePages(root)).length, 1);
    },
    [],
  );
});

// 嵌套目录与中文空格文件名用于确认链接按路径段编码，而非整体编码。
test("嵌套附件路径按路径段编码时通过", async () => {
  const file = "报告 目录/诊断 报告.pdf";
  await withFixture(refHtml([refItem(file)]), async (root) => {
    assert.equal((await loadAndValidatePages(root)).length, 1);
  }, [file]);
});

// 页面骨架校验独立于 Ref 内容：合法 Ref 也不能掩盖缺失的唯一 main。
test("缺少唯一 main 时失败", async () => {
  await withFixture(
    refHtml([refItem("manual.pdf"), refItem("data.csv")]),
    async (root) => {
      const htmlPath = path.join(root, "src", "pages", slug, "index.html");
      const html = await readFile(htmlPath, "utf8");
      await writeFile(htmlPath, html.replaceAll(/<\/?main>/g, ""));
      await assert.rejects(
        loadAndValidatePages(root),
        /必须且只能有一个完整 <main>/,
      );
    },
  );
});

test("metadata 缺少字段时失败", async () => {
  await withFixture(
    '<section id="ref"><p>暂无关联文件。</p></section>',
    async (root) => {
      const metadataPath = path.join(root, "src", "pages", slug, "page.json");
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      delete metadata.title;
      await writeFile(metadataPath, JSON.stringify(metadata));
      await assert.rejects(loadAndValidatePages(root), /缺少有效的 title/);
    },
    [],
  );
});

test("metadata 包含额外字段时失败", async () => {
  await withFixture(
    '<section id="ref"><p>暂无关联文件。</p></section>',
    async (root) => {
      const metadataPath = path.join(root, "src", "pages", slug, "page.json");
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      metadata.file = `src/pages/${slug}/index.html`;
      await writeFile(metadataPath, JSON.stringify(metadata));
      await assert.rejects(loadAndValidatePages(root), /包含未允许字段：file/);
    },
    [],
  );
});

test("metadata slug 与目录名不一致时失败", async () => {
  await withFixture(
    '<section id="ref"><p>暂无关联文件。</p></section>',
    async (root) => {
      const metadataPath = path.join(root, "src", "pages", slug, "page.json");
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      metadata.slug = "other-page";
      await writeFile(metadataPath, JSON.stringify(metadata));
      await assert.rejects(loadAndValidatePages(root), /必须与目录名一致/);
    },
    [],
  );
});

test("metadata slug 重复时失败", async () => {
  await withFixture(
    '<section id="ref"><p>暂无关联文件。</p></section>',
    async (root) => {
      await writePage(root, "second-page", {
        slug,
        title: "重复页面",
        description: "重复 slug",
        publishedAt: "2026-07-29",
        tags: [],
      });
      await assert.rejects(loadAndValidatePages(root), /slug 重复/);
    },
    [],
  );
});

test("页面缺少 index.html 时失败", async () => {
  await withFixture(
    '<section id="ref"><p>暂无关联文件。</p></section>',
    async (root) => {
      await rm(path.join(root, "src", "pages", slug, "index.html"));
      await assert.rejects(loadAndValidatePages(root), /ENOENT/);
    },
    [],
  );
});

test("页面按日期降序且同日按 slug 升序", async () => {
  await withFixture(
    '<section id="ref"><p>暂无关联文件。</p></section>',
    async (root) => {
      await writePage(root, "z-page", {
        slug: "z-page",
        title: "Z",
        description: "Z",
        publishedAt: "2026-07-29",
        tags: [],
      });
      await writePage(root, "a-page", {
        slug: "a-page",
        title: "A",
        description: "A",
        publishedAt: "2026-07-29",
        tags: [],
      });
      assert.deepEqual(
        (await loadAndValidatePages(root)).map((page) => page.slug),
        ["a-page", "z-page", slug],
      );
    },
    [],
  );
});

// 每个用例在临时目录构造最小仓库，并在断言完成后统一清理，避免相互污染。
async function withFixture(refSection, run, files = ["manual.pdf", "data.csv"]) {
  const root = await mkdtemp(path.join(os.tmpdir(), "static-page-test-"));
  try {
    await mkdir(path.join(root, "src", "pages", slug), { recursive: true });
    await mkdir(path.join(root, "references", slug), { recursive: true });
    await writeFile(
      path.join(root, "src", "pages", slug, "page.json"),
      `${JSON.stringify({
        slug,
        title: "验收页面",
        description: "校验 Ref",
        publishedAt: "2026-07-28",
        tags: ["测试"],
      })}\n`,
    );
    await writeFile(
      path.join(root, "src", "pages", slug, "index.html"),
      `<main><section><h1>正文</h1></section>${refSection}</main>`,
    );
    for (const file of files) {
      await mkdir(path.dirname(path.join(root, "references", slug, file)), {
        recursive: true,
      });
      await writeFile(path.join(root, "references", slug, file), file);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writePage(root, directory, metadata) {
  const pageDirectory = path.join(root, "src", "pages", directory);
  await mkdir(pageDirectory, { recursive: true });
  await writeFile(
    path.join(pageDirectory, "page.json"),
    `${JSON.stringify(metadata)}\n`,
  );
  await writeFile(
    path.join(pageDirectory, "index.html"),
    "<main><section><h1>正文</h1></section><section id=\"ref\"><p>暂无关联文件。</p></section></main>",
  );
}

// 以下辅助函数集中生成规范 Ref 结构，让各测试只表达输入差异和预期结果。
function refHtml(items) {
  return `<section id="ref"><h2>Ref</h2><ul>${items.join("")}</ul></section>`;
}

function refItem(file, description = `说明 ${file}`) {
  const encoded = file.split("/").map(encodeURIComponent).join("/");
  return `<li><a href="${rawBase}${encoded}" target="_blank" rel="noopener noreferrer">${file}</a><p>${description}</p></li>`;
}
