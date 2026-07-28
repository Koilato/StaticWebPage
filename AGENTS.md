# StaticWebPage 发布规则

当用户要求添加新的静态页面时：

1. 检查 HTML 中是否存在缺失的本地图片、样式或脚本资源，以及密钥、
   令牌、Cookie、`.env` 或其他凭据。
2. 为页面选择稳定的小写连字符 slug，且不得复用已有 slug。
3. 使用 `npm run add-page -- ...` 将页面放入
   `src/pages/<slug>/index.html`，并更新 `pages.json`。
4. 保留页面原始内容和视觉效果，不做未经要求的设计修改。
5. 运行 `npm run check`，然后通过本地 HTTP 服务检查根目录和新页面。
6. 只提交源文件、元数据和脚本；不要提交自动生成的 `dist/`。
7. 提交到 `main` 分支并推送，让 Vercel 自动构建和发布。
8. 部署后检查 Vercel 状态和正式 URL，再向用户报告完成。
