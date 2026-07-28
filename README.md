# StaticWebPage

托管在 Vercel 上的静态页面集合站。一个仓库和一个 Vercel Project
承载多个相互隔离的静态页面。

## 目录结构

```text
src/pages/<slug>/    页面源文件
references/<slug>/   Ref 章节的 GitHub 下载文件
scripts/             添加、构建和校验脚本
pages.json           页面元数据
dist/                自动生成的部署目录，不提交
```

根地址是自动生成的页面目录，每个页面通过 `/<slug>/` 访问。

## 添加页面

新增页面必须先由 AI 把最终 Ref 写入 HTML，再使用唯一发布入口：

```bash
npm run publish:page -- <页面参数> --dry-run
npm run publish:page -- <相同页面参数> --push
```

参数、目录、Ref、GitHub 和 Vercel 的唯一操作入口见
`.agents/skills/publish-static-pages/SKILL.md`。

## 校验与构建

```bash
npm run validate
npm run build
```

推送到 `main` 分支后，Vercel 根据 `vercel.json` 自动构建并发布 `dist/`。
