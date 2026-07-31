# Vercel 部署

## 职责

本文件规定发布 PR 合并后的自动部署观察和正式环境验收。不规定 GitHub 对象创建或 HTML 编辑方式。

## 部署路径

- 正式目录页：`https://static-web-page-pied.vercel.app/`
- 正式页面：`https://static-web-page-pied.vercel.app/<slug>/`
- 生产分支：`main`
- 构建命令：`npm run build`
- 输出目录：`dist`

GitHub Actions 在 PR 和 main 上执行 `npm run check`。PR 合并后，既有 Vercel Git 集成独立执行 `npm run build`：扫描所有 `src/pages/*/page.json`，临时生成根 `pages.json` 和 `dist/`，然后部署。正常发布不运行 Vercel CLI，也不提交构建产物。

## 轮询与验收

Vercel 部署可能晚于 GitHub 合并。使用 cache-busting 查询参数持续轮询，不能以单次 HTTP 200 证明新版本上线。

依次验证：

1. 正式目录页成功返回，并显示本次 metadata 的标题、简介和入口。
2. 正式页面成功返回，且包含本次版本的唯一内容标记。
3. 页面所有本地 assets 均可加载。
4. HTML 中 Ref 清单与 main 的 `references/<slug>/` 一致。
5. 每个 GitHub Raw URL 返回成功；本次上传附件应与本地文件逐字节一致。
6. 页面视觉或交互发生变化时，使用浏览器检查桌面与窄屏、控制台、核心交互和布局。

若仍为旧内容、任一资源失败、Ref 不一致或轮询超时，应报告具体失败项，不得报告发布成功。

## 成功输出

全部验收通过后记录正式页面 URL、PR URL、main merge commit、Ref 文件数量和验收摘要。
