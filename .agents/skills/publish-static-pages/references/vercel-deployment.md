# Vercel 部署

## 职责

本文件只规定 `main` 推送后的自动部署观察和正式环境验收。不规定 Git 提交方式、仓库目录或 HTML 模板。

## 部署目标

推送 `main` 后，由 Vercel Git 集成自动构建；不执行手工 Vercel 上传。

- 正式目录页：`https://static-web-page-pied.vercel.app/`
- 正式页面：`https://static-web-page-pied.vercel.app/<slug>/`
- 构建命令：`npm run build`
- 输出目录：`dist`

Vercel 只需保持 GitHub 仓库、生产分支 `main`、构建命令和输出目录的既有配置。`npm run publish:check` 会在每次发布前验证仓库中的 `vercel.json`；正常发布不运行 Vercel CLI，也不创建第二个 Vercel Project。

## 轮询与验收

自动部署可能晚于 GitHub 推送完成。持续轮询正式页面，直至出现本次发布的唯一内容标记和预期 Ref URL，或达到合理超时；单次 HTTP `200` 不能证明新版本已经上线。

依次验证：

1. 正式目录页返回成功，并显示本页最新标题、简介和入口。
2. 正式页面返回成功，内容是本次提交版本。
3. 页面存在唯一 Ref，且其内容和附件清单与源 HTML 一致。
4. 每个 GitHub Raw URL 均返回对应文件的成功响应；不能只检查链接字符串。
5. 页面所需本地资源可加载，核心样式与交互正常。

若正式页面仍是旧内容、任一附件不可访问、页面资源失败或轮询超时，应报告具体失败项，不得报告发布成功。

## 成功输出

只有所有验收项通过，才记录正式页面 URL、已验证的提交 SHA、Ref 文件数量与验证结果，交回入口文件生成完成报告。
