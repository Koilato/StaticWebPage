# Ref 附件目录

本目录只存放 Ref 章节提供给访问者打开或下载的文件，并按页面 slug
隔离：

```text
references/
└── <slug>/
    ├── document.pdf
    └── example.zip
```

`references/` 不会复制到 `dist/`，因此附件流量由 GitHub 承担。

完整归属和发布规则只在
`.agents/skills/publish-static-pages/SKILL.md` 及其按任务指定的文档中
维护；本文件不重复规则。
