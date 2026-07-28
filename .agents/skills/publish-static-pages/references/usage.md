# 使用说明

## 1. 接收并检查输入

1. 找到用户提供的 HTML 或页面目录。
2. 列出用户提供的 Ref 文件。
3. 检查 HTML 是否引用缺失的相对资源。
4. 检查所有文件是否包含密码、令牌、Cookie、私钥、节点凭据或 `.env`。
5. 从用户指定值或标题生成 slug，并检查 `pages.json` 中是否已存在。

## 2. 整理 Ref 文件

为页面创建：

```text
references/<slug>/
```

将用户提供的 Ref 文件原样复制到该目录。文件名必须具有明确含义；若修改
文件名，必须同步使用修改后的名称生成链接。

对 URL 的每个路径段分别进行百分号编码。示例：

```text
references/example-page/诊断 报告.pdf
```

对应：

```text
https://raw.githubusercontent.com/Koilato/StaticWebPage/main/references/example-page/%E8%AF%8A%E6%96%AD%20%E6%8A%A5%E5%91%8A.pdf
```

## 3. 直接修改 HTML

删除 HTML 中旧的 Ref 章节，然后在最后一个正文章节之后、`</main>` 之前
写入一个新的完整 Ref。严格使用 [Schema](schema.md) 中的结构。

不使用占位符，不等待构建脚本补充，不把 Ref 内容写入 `pages.json`。

## 4. 保存页面

将最终 HTML 保存为：

```text
src/pages/<slug>/index.html
```

页面运行资源保存在：

```text
src/pages/<slug>/assets/
```

新增页面时可使用：

```bash
npm run add-page -- \
  --source <已写入Ref的HTML或页面目录> \
  --slug <slug> \
  --title "<标题>" \
  --description "<简介>" \
  --tags "<标签1,标签2>"
```

更新已有页面时直接修改其 `src/pages/<slug>/`，不得创建第二条同 slug
记录。

## 5. 更新页面目录

按照 [Schema](schema.md) 更新 `pages.json`。新增一条页面记录或修改现有
记录，不得加入 Ref 字段。

## 6. 发布前检查

在仓库根目录执行：

```bash
npm run publish:check
```

然后检查：

```bash
git status --short
git diff --check
git diff
```

必须确认：

- `dist/` 未进入待提交文件。
- Ref 文件位于正确的 `references/<slug>/`。
- 源 HTML 已经包含最终 Ref。
- Ref 链接全部使用 GitHub Raw。
- 没有无关文件和敏感信息。

## 7. 上传 GitHub

只添加本次相关文件：

```bash
git add <相关文件>
git commit -m "<准确描述本次页面发布>"
git push origin main
```

不得使用包含令牌的远端 URL，不得修改 Git 全局凭据配置。

## 8. 验证 Vercel

推送成功后轮询：

```text
https://static-web-page-pied.vercel.app/
https://static-web-page-pied.vercel.app/<slug>/
```

检查页面标题、正文、Ref 章节和每个 GitHub Raw 链接。只有正式地址返回
新内容，且 GitHub Raw 文件可以访问时，才算发布完成。
