# Vercel 部署

`main` 合并后，Vercel 运行 `npm run build` 并部署 `dist/`。正式目录为 `https://static-web-page-pied.vercel.app/`，页面为 `/<slug>/`；Ref 从 GitHub Raw 下载，不进入 Vercel 构建。

部署可能晚于合并。使用 cache-busting 查询参数持续轮询，不能用单次 HTTP 200 证明新版上线。依次确认：

1. 目录页出现本次标题、简介和入口；
2. 页面包含本次版本的唯一内容标记，所有本地资源可加载；
3. HTML Ref 与 `main` 的 `references/<slug>/` 一致；
4. 每个 Raw URL 可下载，本次附件与本地文件逐字节一致；
5. 有视觉或交互变化时，桌面、窄屏、控制台和核心交互正常。

仍为旧内容、资源或 Ref 失败、视觉异常或超时时，报告具体失败项。全部通过后记录正式 URL、PR URL、merge commit、Ref 数量和验收摘要。
