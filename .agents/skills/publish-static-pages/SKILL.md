---
name: publish-static-pages
description: 将用户提供的静态 HTML 和 Ref 附件加入 StaticWebPage 单仓库站点，修改源 HTML、生成 GitHub Raw 链接、更新页面目录、校验并推送 main 以触发 Vercel 自动构建。用户要求新增、替换、更新、上传或发布静态页面及其参考文件时使用。
---

# 静态网页发布

在 `StaticWebPage` 仓库中完成静态页面从接收到上线的全流程。全程使用中文。

## 必须读取

1. 开始操作前完整读取 [基本规则](references/basic.md)。
2. 执行上传和发布时完整读取 [使用说明](references/usage.md)。
3. 创建目录、修改 `pages.json` 或编写 Ref 时完整读取
   [Schema](references/schema.md)。

## 必要输入

从用户输入或文件内容中确定：

- HTML 文件或包含 `index.html` 的页面目录。
- Ref 文件；允许为空。
- 页面标题、简介和标签。
- 页面 slug；用户未指定时，根据标题生成。

只有在标题、文件归属或 slug 存在无法安全消除的冲突时才询问用户。

## 固定流程

1. 确认仓库根目录包含 `pages.json`、`package.json` 和 `vercel.json`。
2. 检查 HTML 的本地资源、敏感信息和现有 Ref。
3. 确定唯一且永久不变的 slug。
4. 将 Ref 文件放入 `references/<slug>/`。
5. 为每个 Ref 文件生成对应的 GitHub Raw 地址。
6. 直接修改源 HTML，在正文最后写入完整的 `<section id="ref">`。
7. 将修改后的页面保存到 `src/pages/<slug>/index.html`，运行所需资源放在
   同目录或其 `assets/` 下。
8. 只在 `pages.json` 更新页面目录信息；不得保存 Ref 元数据。
9. 运行 `npm run publish:check`。
10. 检查 Git diff，确认 `dist/` 和凭据没有进入提交。
11. 提交相关文件并运行 `git push origin main`。
12. 等待 Vercel 自动构建，验证目录首页、页面 URL 和全部 Ref 链接。

## 禁止事项

- 不得由 `pages.json` 或构建脚本生成、注入或修改 Ref。
- 不得把 Ref 文件放入 `src/pages/` 或 `dist/`。
- 不得让 Ref 链接指向 Vercel 的 `/references/...`。
- 不得提交 `dist/`、令牌、Cookie、私钥或 `.env`。
- 不得在未完成线上验证时报告发布成功。

## 完成标准

仅在以下条件全部满足后报告完成：

- `npm run publish:check` 成功。
- 本地 `main` 与远端 `origin/main` 指向同一提交。
- Vercel 正式页面已经包含源 HTML 中的 Ref。
- Ref 链接从 `raw.githubusercontent.com` 返回对应文件。

最终报告页面 URL、GitHub 仓库 URL、提交短 SHA 和 Ref 文件数量。
