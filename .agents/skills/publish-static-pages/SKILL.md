---
name: publish-static-pages
description: 在 StaticWebPage 仓库中新增、更新、替换或发布静态 HTML 页面及其 Ref 附件；包括维护页面界面、通过 GitHub API 创建发布 PR、观察 CI 和验证 Vercel 正式环境。
---
# 静态页面发布

本文件是仓库静态页面工作的唯一入口。全程使用中文；只按当前任务读取下表所列的直接引用，不沿用其他发布说明。

## 固定目标

- 仓库：`Koilato/StaticWebPage`
- 生产分支：`main`
- 正式站点：`https://static-web-page-pied.vercel.app`
- Raw 前缀：`https://raw.githubusercontent.com/Koilato/StaticWebPage/main/`
- GitHub API 令牌：优先读取 `GH_TOKEN`，其次读取 `GITHUB_TOKEN`

发布器不克隆、拉取或修改本地 Git 工作树，也不直接推送 `main`。它通过 GitHub Tree API 探测远端目录，通过 Git Database API 创建独立提交和 `publish/<slug>-...` 分支，再创建 PR 并启用 squash auto-merge。

## 远端目录结构

```text
StaticWebPage/
├── .github/workflows/publish-check.yml
├── src/pages/<slug>/
│   ├── index.html
│   ├── page.json
│   └── assets/
├── references/<slug>/
├── scripts/
├── package.json
└── vercel.json
```

根 `pages.json` 和 `dist/` 都是构建产物，不提交。每个发布分支只写自己的页面目录、metadata 和可选 Ref；CI/Vercel 扫描所有 `page.json`，生成统一索引。

## slug 与 metadata

slug 首次发布后永久稳定，不因标题变化而修改，不得复用给其他页面；必须匹配：

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

每页的 `src/pages/<slug>/page.json` 只含：

```json
{
  "slug": "network-tun-repair",
  "title": "v2rayN TUN 网络修复",
  "description": "完整推理与操作记录",
  "publishedAt": "2026-07-28",
  "tags": ["网络", "TUN", "故障排查"]
}
```

`file` 由构建器按 slug 生成，不写入 page metadata。聚合索引按 `publishedAt` 降序、同日按 slug 升序。

## 文件规则

1. HTML 入库名称固定为 `src/pages/<slug>/index.html`。
2. HTML 使用的本地资源放在同一页面目录内，通常为 `assets/`，并使用可部署的相对链接。
3. Ref 放在 `references/<slug>/`，HTML 中使用最终 `main` Raw URL。
4. 页面必须含唯一 `main` 和唯一 `section#ref`；Ref 是 `main` 内最后一个 section。
5. 禁止上传凭据、令牌、Cookie、私钥、`.env`、符号链接或超过 100 MiB 的文件。

## 文件路由

| 文件 | 何时读取 | 输出 |
| --- | --- | --- |
| [编辑静态界面](references/edit-static-ui.md) | 新增或改变 HTML、资源引用、Ref 区块时 | 可直接发布的页面源文件与 Ref 清单 |
| [GitHub 发布](references/github-publish.md) | 演练、创建发布 PR、观察 CI/合并时 | PR URL、远端提交、合并结果 |
| [Vercel 部署](references/vercel-deployment.md) | PR 合并后等待和验证正式环境时 | 正式页面与附件验收结果 |

## 脚本路由

| 脚本 | 用法 | 作用 |
| --- | --- | --- |
| Skill `scripts/publish-page.mjs` | 只通过 `npm run publish:page -- ...` | 只读探测远端、校验输入、创建 Blob/Tree/Commit/分支/PR |
| Skill `scripts/preflight.mjs` | `npm run publish:check` | 在 CI 或维护场景执行完整测试、校验和构建 |
| 根目录 `scripts/check-generated-files.mjs` | `npm run check:generated` | 拒绝把根索引或 dist 重新加入 Git |
| 根目录 `scripts/site-utils.mjs` | 不直接运行 | 聚合并校验每页 metadata、资源和 Ref |
| 根目录 `scripts/generate-pages.mjs` | `npm run generate:pages` | 生成构建期根 `pages.json` |
| 根目录 `scripts/validate.mjs` | `npm run validate` | 校验分散的 page metadata 与页面 |
| 根目录 `scripts/build.mjs` | `npm run build` | 生成根 `pages.json`、`dist/`、目录首页和 sitemap |

## 执行流程

1. 确定新增或更新、稳定 slug、最终 HTML、运行资源和完整 Ref 语义。
2. 涉及 HTML 时先按编辑文档生成最终页面；Raw URL 始终指向 `main`。
3. 按 GitHub 文档先运行相同参数的 `--dry-run`；成功后改为 `--pr`。
4. `--pr` 创建独立分支和 PR，不在本地构建，不直推 main。
5. 通过 GitHub API观察 `publish-check`、auto-merge 和合并提交；失败时报告 PR 与具体检查，不得声称发布成功。
6. 合并后按 Vercel 文档轮询目录、页面、资源和 Raw Ref；页面视觉有变化时执行浏览器视觉验收。

## 停止条件

- slug、页面归属或更新语义无法唯一判断；
- 远端 Tree 返回截断且逐层读取仍不完整；
- 输入含敏感内容、符号链接或不支持的大文件；
- PR 创建、必需检查、自动合并或线上验证失败；
- 同一 slug 的并行更新产生合并冲突。

## 完成报告

只有 PR 已合并且线上验收全部通过，才报告正式页面 URL、PR URL、合并提交短 SHA 和 Ref 文件数量。若任务只改本地代码或文档，应明确说明尚未推送、未配置仓库规则且未部署。
