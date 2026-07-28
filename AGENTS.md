# StaticWebPage 发布规则

当用户要求添加新的静态页面时：

1. 检查 HTML 中是否存在缺失的本地图片、样式或脚本资源，以及密钥、
   令牌、Cookie、`.env` 或其他凭据。
2. 为页面选择稳定的小写连字符 slug，且不得复用已有 slug。
3. 使用 `npm run add-page -- ...` 将页面放入
   `src/pages/<slug>/index.html`，并更新 `pages.json`。
4. 每个页面都必须有 `references` 数组。将 Ref 章节中提供给用户查看或
   下载的文件放在 `references/<slug>/`，并登记 `title`、`description`
   和 `file`；没有附件时使用空数组。
5. Ref 文件不得放入 `src/pages/` 或 `dist/`。构建脚本必须在页面末尾
   生成 `id="ref"` 的 Ref 章节，并使用
   `raw.githubusercontent.com/Koilato/StaticWebPage/main/...` 链接，
   确保附件流量不经过 Vercel。
6. 网页运行必需的图片、CSS 和 JavaScript 仍放在
   `src/pages/<slug>/`，不能当作 Ref 附件。
7. 保留页面原始内容和视觉效果，不做未经要求的设计修改。
8. 运行 `npm run check`，然后通过本地 HTTP 服务检查根目录、新页面、
   Ref 章节和所有 GitHub 文件链接。
9. 只提交源文件、引用文件、元数据和脚本；不要提交自动生成的 `dist/`。
10. 提交到 `main` 分支并推送，让 Vercel 自动构建和发布。
11. 部署后检查 Vercel 状态、正式 URL 和 Ref 链接，再向用户报告完成。
