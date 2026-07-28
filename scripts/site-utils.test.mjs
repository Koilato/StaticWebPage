import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadAndValidatePages } from "./site-utils.mjs";

const slug = "acceptance-page";
const rawBase =
  "https://raw.githubusercontent.com/Koilato/StaticWebPage/main/" +
  `references/${slug}/`;

test("两个附件均有名称、说明和唯一 Raw 链接时通过", async () => {
  await withFixture(refHtml([refItem("manual.pdf"), refItem("data.csv")]), async (root) => {
    assert.equal((await loadAndValidatePages(root)).length, 1);
  });
});

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

test("没有附件且明确写暂无关联文件时通过", async () => {
  await withFixture(
    '<section id="ref"><h2>Ref</h2><p>暂无关联文件。</p></section>',
    async (root) => {
      assert.equal((await loadAndValidatePages(root)).length, 1);
    },
    [],
  );
});

test("嵌套附件路径按路径段编码时通过", async () => {
  const file = "报告 目录/诊断 报告.pdf";
  await withFixture(refHtml([refItem(file)]), async (root) => {
    assert.equal((await loadAndValidatePages(root)).length, 1);
  }, [file]);
});

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

async function withFixture(refSection, run, files = ["manual.pdf", "data.csv"]) {
  const root = await mkdtemp(path.join(os.tmpdir(), "static-page-test-"));
  try {
    await mkdir(path.join(root, "src", "pages", slug), { recursive: true });
    await mkdir(path.join(root, "references", slug), { recursive: true });
    await writeFile(
      path.join(root, "pages.json"),
      `${JSON.stringify([
        {
          slug,
          title: "验收页面",
          description: "校验 Ref",
          file: `src/pages/${slug}/index.html`,
          publishedAt: "2026-07-28",
          tags: ["测试"],
        },
      ])}\n`,
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

function refHtml(items) {
  return `<section id="ref"><h2>Ref</h2><ul>${items.join("")}</ul></section>`;
}

function refItem(file, description = `说明 ${file}`) {
  const encoded = file.split("/").map(encodeURIComponent).join("/");
  return `<li><a href="${rawBase}${encoded}" target="_blank" rel="noopener noreferrer">${file}</a><p>${description}</p></li>`;
}
