# StaticWebPage

托管在 Vercel 上的静态页面集合站。一个仓库和一个 Vercel Project 承载多个相互隔离的静态页面。

## 目录结构

```text
src/pages/<slug>/index.html   页面源文件
src/pages/<slug>/page.json    独立页面 metadata
references/<slug>/            Ref 章节的 GitHub 下载文件
scripts/                       聚合、校验和构建脚本
pages.json                     构建时生成的统一索引，不提交
dist/                          自动生成的部署目录，不提交
```

根地址是自动生成的页面目录，每个页面通过 `/<slug>/` 访问。

## 发布页面

发布器不要求本地 Git 仓库与 main 同步，也不直接推送 main。它读取远端 GitHub Tree，通过 GitHub API 创建独立发布分支和 PR。

```bash
npm run publish:page -- <页面参数> --dry-run
GH_TOKEN=<token> npm run publish:page -- <相同页面参数> --pr
```

新增和更新参数、Ref 规则、PR 合并与线上验收的唯一入口见 `.agents/skills/publish-static-pages/SKILL.md`。

## 校验与构建

```bash
npm test
npm run validate
npm run generate:pages
npm run build
```

GitHub Actions 对 PR 和 main 运行密钥扫描及 `npm run check`。仓库管理员完成 main ruleset、`publish-check` 必需检查、squash/auto-merge 和自动删除分支配置后，发布器才允许创建 PR；Vercel 随 main 更新执行 `npm run build`，生成 `pages.json` 和 `dist/` 后部署。
