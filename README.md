# StaticWebPage

一个托管在 Vercel 上的静态页面仓库。

当前首页：

- v2rayN TUN 网络修复：完整推理与操作记录

## 发布方式

仓库连接到 Vercel 后，推送到 `main` 分支会自动触发生产部署。

## 添加新页面

将每个新页面放到独立目录中：

```text
page-slug/
└── index.html
```

页面将通过 `/page-slug/` 访问。
