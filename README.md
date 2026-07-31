# StaticWebPage

一个 Vercel Project 承载多个相互隔离的静态页面。

## 结构

```text
src/pages/<slug>/index.html   页面源文件
src/pages/<slug>/page.json    页面 metadata
references/<slug>/            GitHub Raw 附件
pages.json                     构建生成的索引，不提交
dist/                          Vercel 输出，不提交
```

新增、更新或发布页面时，使用 `.agents/skills/publish-static-pages/SKILL.md`。

## 构建

```bash
npm run build
```
