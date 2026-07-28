# 仓库布局

## 职责

本文件只规定 slug、文件归属、目录、`pages.json` 和 Ref HTML 结构。不规定 Git 上传、Raw 编码或 Vercel 验证。

## 标准目录

仓库固定结构：

```text
StaticWebPage/
├── .agents/skills/publish-static-pages/
│   ├── SKILL.md
│   ├── references/
│   └── scripts/
├── src/pages/<slug>/
│   ├── index.html
│   └── assets/
├── references/<slug>/
├── scripts/
├── pages.json
├── package.json
├── vercel.json
└── dist/
```

`dist/` 不提交 Git；`references/` 不复制到 `dist/`。

HTML、CSS、JavaScript、字体和页面显示所需图片属于运行资源。PDF、DOCX、ZIP、日志、数据、示例配置及其他下载附件属于 Ref。不能仅凭扩展名判断；以文件是否参与页面运行作为归属标准。



## pages.json

根节点必须是数组。每项只允许以下字段，不得加入 `references` 或其他字段：

| 字段 | 要求 |
| --- | --- |
| `slug` | 唯一且符合 slug 规则 |
| `title` | 非空字符串 |
| `description` | 非空字符串 |
| `file` | 精确为 `src/pages/<slug>/index.html` |
| `publishedAt` | `YYYY-MM-DD` |
| `tags` | 无重复非空字符串数组 |

示例：

```json
{
  "slug": "network-tun-repair",
  "title": "v2rayN TUN 网络修复",
  "description": "完整推理与操作记录",
  "file": "src/pages/network-tun-repair/index.html",
  "publishedAt": "2026-07-28",
  "tags": ["网络", "TUN", "故障排查"]
}
```

