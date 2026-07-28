# StaticWebPage 发布规则

当用户要求添加新的静态页面时：

1. 检查 HTML 中是否存在缺失的本地图片、样式或脚本资源，以及密钥、
   令牌、Cookie、`.env` 或其他凭据。
2. 为页面选择稳定的小写连字符 slug，且不得复用已有 slug。
3. 使用 `npm run add-page -- ...` 将页面放入
   `src/pages/<slug>/index.html`，并更新 `pages.json`。
4. 用户提供 Ref 文件时，将文件上传到 `references/<slug>/`，然后按照
   实际文件路径生成
   `https://raw.githubusercontent.com/Koilato/StaticWebPage/main/...`
   链接。
5. 在上传页面前，必须直接修改 `src/pages/<slug>/index.html`，在正文
   最后写入完整的 `<section id="ref">`，包括标题、文件说明和 GitHub
   Raw 链接。Ref 是源 HTML 的一部分，不得由 `pages.json` 或构建脚本
   动态生成。没有文件时也必须保留 Ref 章节并写明“暂无关联文件”。
6. Ref 文件不得放入 `src/pages/` 或 `dist/`，确保附件流量不经过
   Vercel。
7. 网页运行必需的图片、CSS 和 JavaScript 仍放在
   `src/pages/<slug>/`，不能当作 Ref 附件。
8. 保留页面原始内容和视觉效果，不做未经要求的设计修改。
9. 运行 `npm run check`，然后通过本地 HTTP 服务检查根目录、新页面、
   源 HTML 中的 Ref 章节和所有 GitHub 文件链接。
10. 只提交源文件、引用文件、页面目录元数据和脚本；不要提交自动生成的
    `dist/`。
11. 提交到 `main` 分支并推送，让 Vercel 自动构建和发布。
12. 部署后检查 Vercel 状态、正式 URL 和 Ref 链接，再向用户报告完成。
