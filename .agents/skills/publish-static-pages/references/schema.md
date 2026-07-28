# Schema

## 仓库目录 Schema

```text
StaticWebPage/
├── src/pages/<slug>/
│   ├── index.html
│   └── assets/
├── references/<slug>/
├── pages.json
├── package.json
├── vercel.json
└── dist/
```

`dist/` 是构建产物，不提交 Git。`references/` 不得复制到 `dist/`。

## pages.json Schema

文件必须是页面对象数组。页面对象不允许额外字段：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "slug",
      "title",
      "description",
      "file",
      "publishedAt",
      "tags"
    ],
    "properties": {
      "slug": {
        "type": "string",
        "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$"
      },
      "title": {
        "type": "string",
        "minLength": 1
      },
      "description": {
        "type": "string",
        "minLength": 1
      },
      "file": {
        "type": "string",
        "pattern": "^src/pages/[a-z0-9]+(?:-[a-z0-9]+)*/index\\.html$"
      },
      "publishedAt": {
        "type": "string",
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      },
      "tags": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1
        },
        "uniqueItems": true
      }
    }
  }
}
```

合法示例：

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

## Ref HTML Schema

有文件时使用：

```html
<section id="ref">
  <h2>Ref</h2>
  <p>以下文件由 GitHub 直接提供，下载不经过 Vercel。</p>
  <ul>
    <li>
      <a
        href="https://raw.githubusercontent.com/Koilato/StaticWebPage/main/references/<slug>/<编码后的文件名>"
        target="_blank"
        rel="noopener noreferrer"
      >文件显示名称</a>
      <p>说明文件内容和用途。</p>
    </li>
  </ul>
</section>
```

多个文件时，每个文件对应一个独立 `<li>`。

没有文件时使用：

```html
<section id="ref">
  <h2>Ref</h2>
  <p>暂无关联文件。</p>
</section>
```

允许添加与原页面一致的 `class`，但不得改变以下约束：

- `section` 的 `id` 必须精确为 `ref`。
- Ref 必须是源 HTML 正文的最后一个 section。
- 所有附件链接必须使用规定的 GitHub Raw 前缀。
- 链接路径必须属于当前页面的 `references/<slug>/`。
- 链接目标文件必须已经存在于仓库中。

## Vercel Schema

`vercel.json` 必须为：

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

`package.json` 必须至少包含：

```json
{
  "scripts": {
    "build": "node scripts/build.mjs",
    "validate": "node scripts/validate.mjs",
    "check": "npm run validate && npm run build",
    "publish:check": "node .agents/skills/publish-static-pages/scripts/preflight.mjs"
  }
}
```
