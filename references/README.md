# Reference files

Ref 章节中提供给访问者查看或下载的文件放在这里，按页面 slug 隔离：

```text
references/
└── <slug>/
    ├── document.pdf
    └── example.zip
```

随后在 `pages.json` 对应页面的 `references` 数组中登记：

```json
{
  "title": "文件名称",
  "description": "说明该文件的内容和用途",
  "file": "references/<slug>/document.pdf"
}
```

构建脚本会在网页末尾生成 Ref 章节，并把 `file` 转换为
`raw.githubusercontent.com` 直链。`references/` 不会复制到 `dist/`，
因此附件流量由 GitHub 承担。

网页正常显示所必需的图片、CSS 和 JavaScript 仍应放在
`src/pages/<slug>/`，不要放在这里。
