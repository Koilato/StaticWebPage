# Reference files

Ref 章节中提供给访问者查看或下载的文件放在这里，按页面 slug 隔离：

```text
references/
└── <slug>/
    ├── document.pdf
    └── example.zip
```

AI 上传文件后，生成对应的 `raw.githubusercontent.com` 地址，并直接
修改 `src/pages/<slug>/index.html`，在正文最后写入完整的
`<section id="ref">`。Ref 不由 `pages.json` 或构建脚本生成。

`references/` 不会复制到 `dist/`，因此附件流量由 GitHub 承担。

网页正常显示所必需的图片、CSS 和 JavaScript 仍应放在
`src/pages/<slug>/`，不要放在这里。
