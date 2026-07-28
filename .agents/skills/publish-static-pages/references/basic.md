# 基本规则

## 唯一目录规则

页面 slug 为 `<slug>` 时，只允许使用以下位置：

```text
src/pages/<slug>/index.html   页面源 HTML
src/pages/<slug>/assets/      页面运行必需资源
references/<slug>/            Ref 提供的文件
dist/<slug>/                  自动生成的部署结果
```

`slug` 必须匹配：

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

slug 发布后不得因标题变化而修改或复用。

## 文件归属

- HTML、CSS、JavaScript、字体和页面显示必需图片属于页面运行资源，放入
  `src/pages/<slug>/`。
- PDF、DOCX、ZIP、日志、数据文件、示例配置和供访问者下载的其他附件属于
  Ref 文件，放入 `references/<slug>/`。
- Ref 文件不得被复制到 `dist/`。

## Ref 规则

- Ref 必须由 AI 在上传前直接写入源 HTML。
- 每个源 HTML 必须且只能有一个 `<section id="ref">`。
- Ref 必须位于正文最后、`</main>` 之前。
- 没有 Ref 文件时也必须保留 Ref，并明确写“暂无关联文件”。
- 有文件时，每个文件必须有名称、用途说明和 GitHub Raw 链接。
- Ref 中不得出现 Vercel 本地附件链接。

GitHub Raw 地址固定为：

```text
https://raw.githubusercontent.com/Koilato/StaticWebPage/main/references/<slug>/<编码后的文件路径>
```

## 页面目录规则

`pages.json` 只记录页面目录信息：

- `slug`
- `title`
- `description`
- `file`
- `publishedAt`
- `tags`

不得在 `pages.json` 中加入 `references` 或其他 Ref 内容。

## 发布规则

- 生产分支固定为 `main`。
- Git 远端固定为 `https://github.com/Koilato/StaticWebPage.git`。
- Vercel 构建命令固定为 `npm run build`。
- Vercel 输出目录固定为 `dist`。
- 推送 `main` 后由 Vercel 的 Git 集成自动构建，不执行手工 Vercel 上传。
