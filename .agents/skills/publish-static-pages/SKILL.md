---
name: publish-static-pages
description: 在 StaticWebPage 仓库中新增、更新、替换或发布静态 HTML 页面及其 Ref 附件；包括维护页面界面、通过 GitHub API 创建发布 PR、观察 CI 和验证 Vercel 正式环境。
---
# 静态页面发布

全程使用中文。本文件是唯一入口；只读取当前阶段对应的直接引用。

## 固定目标

- 仓库 `Koilato/StaticWebPage`，生产分支 `main`
- 站点 `https://static-web-page-pied.vercel.app`
- Raw 前缀 `https://raw.githubusercontent.com/Koilato/StaticWebPage/main/`
- 鉴权顺序：`GH_TOKEN`、`GITHUB_TOKEN`、Git HTTPS credential helper

发布器读取远端 Tree，通过 Git Database API 创建独立提交、分支和 PR；不修改本地工作树、不直推 `main`。`pages.json` 与 `dist/` 由构建生成，不提交。

## 页面结构

```text
src/pages/<slug>/index.html
src/pages/<slug>/page.json
src/pages/<slug>/assets/       # 可选
references/<slug>/             # 可选 Ref
```

slug 只用小写字母、数字和单个连字符分隔的片段，首次发布后保持稳定。`page.json` 只含 `slug`、`title`、`description`、`publishedAt`、`tags`；`file` 由构建生成。页面应有唯一 `main` 和作为其最后一个 section 的唯一 `section#ref`，Ref 使用最终 `main` Raw URL。

## 按阶段读取

- 修改 HTML、资源或 Ref：读取 [编辑静态界面](references/edit-static-ui.md)。
- 演练、创建 PR、观察 CI/合并：读取 [GitHub 发布](references/github-publish.md)。
- PR 合并后：读取 [Vercel 部署](references/vercel-deployment.md)。

## 流程

1. 确认新增或更新、稳定 slug、最终 HTML 和 Ref 清单。
2. 用相同参数先执行 `npm run publish:page -- ... --dry-run`，成功后改为 `--pr`。
3. 等待 `publish-check`、squash auto-merge，并记录 merge commit。
4. 验收正式目录、页面、资源和 Raw Ref；视觉变化时检查桌面、窄屏和交互。

输入含敏感内容、危险凭据文件、符号链接或超过 100 MiB 的文件时停止。远端 Tree 逐层读取仍截断、PR/检查/合并/线上验收失败或同 slug 冲突时，报告失败，不得声称发布成功。

只有 PR 已合并且线上验收通过，才报告正式 URL、PR URL、merge commit 和 Ref 数量；只改本地时明确尚未发布。
