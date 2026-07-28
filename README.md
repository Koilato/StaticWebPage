# StaticWebPage

托管在 Vercel 上的静态页面集合站。一个仓库和一个 Vercel Project
承载多个相互隔离的静态页面。

## 目录结构

```text
src/pages/<slug>/    页面源文件
scripts/             添加、构建和校验脚本
pages.json           页面元数据
dist/                自动生成的部署目录，不提交
```

根地址是自动生成的页面目录，每个页面通过 `/<slug>/` 访问。

## 添加页面

添加单个自包含 HTML：

```bash
npm run add-page -- \
  --source /path/to/page.html \
  --slug example-page \
  --title "示例页面" \
  --description "页面简介" \
  --tags "示例,文档"
```

如果页面带有图片、CSS 或 JavaScript，请将 `--source` 指向包含
`index.html` 和相关资源的完整目录。

## 校验与构建

```bash
npm run validate
npm run build
```

推送到 `main` 分支后，Vercel 根据 `vercel.json` 自动构建并发布 `dist/`。
