# GitHub API 发布

## 职责

本文件规定远端目录探测、发布命令、独立分支、PR、自动合并和 GitHub 状态观察。不定义 HTML 设计或 Vercel 成功标准。

## 鉴权与权限

`--dry-run` 对公开仓库可匿名执行；`--pr` 必须通过 `GH_TOKEN` 或 `GITHUB_TOKEN` 提供令牌。不得把令牌写入参数、日志、远端 URL 或文件。

令牌至少需要：

- Contents：read/write；
- Pull requests：read/write。
- Actions：read（用于确认 `publish-check.yml` 存在且为 active）。

仓库必须启用 squash merge 和 auto-merge。`main` 规则应要求 PR 与固定检查 `publish-check`，禁止发布器直接推送 main，并在合并后删除 head branch。
`--pr` 会先读取仓库设置、main 的生效 ruleset 和 Actions workflow 状态；任一前提缺失都会在创建 Blob 或分支前停止。

## 唯一发布命令

HTML 必须已经包含最终 Ref。先演练：

```bash
npm run publish:page -- \
  --source <HTML文件或含index.html的目录> \
  --slug <slug> \
  --title "<标题>" \
  [--description "<简介>"] \
  [--tags "<标签1,标签2>"] \
  [--date YYYY-MM-DD] \
  [--ref <Ref文件或目录> ...] \
  [--clear-ref] \
  --dry-run
```

方括号表示可选项，不原样输入。演练成功后使用完全相同的内容，将模式改为：

```bash
npm run publish:page -- <相同页面参数> --pr
```

| 参数 | 行为 |
| --- | --- |
| `--source` | 必需；HTML 文件或含 `index.html` 的完整页面目录。更新时替换整个远端页面目录。 |
| `--slug` | 必需；不存在时新增，存在且结构完整时更新。 |
| `--title` | 必需；写入本页 metadata。 |
| `--description` | 新增时默认标题；更新时省略则保留原值。 |
| `--tags` | 逗号分隔；新增时默认空数组，更新时省略则保留原值。 |
| `--date` | `YYYY-MM-DD`；新增时默认 UTC 当日，更新时省略则保留原值。 |
| `--ref` | 可重复；新增时上传，更新时只要出现就用本次清单全量替换旧 Ref。 |
| `--clear-ref` | 更新时清空旧 Ref；不得与 `--ref` 同时使用。 |
| `--dry-run` / `--pr` | 必须且只能选择一个。 |

更新时省略 `--ref` 和 `--clear-ref` 会保留远端现有 Ref。不同 Ref 输入的顶层名称不得相同。

## 远端实现与冲突语义

1. 读取 `main` ref、commit 和完整 Tree；递归 Tree 被截断时逐层读取子树。
2. 依据 `src/pages/<slug>/page.json` 和 `index.html` 判断新增或更新，拒绝半成品远端结构。
3. 本地临时目录只用于校验输入，不写仓库工作树，不执行本地 `dist` 构建。
4. 完整扫描最终文件中的常见令牌、Authorization、Cookie、密码、连接串和私钥；CI 再用 gitleaks 独立扫描。
5. 文本 Blob 使用 UTF-8；二进制 Blob 使用 Base64。超过 50 MiB 警告，超过 100 MiB 拒绝。
6. 基于读取到的 main tree 一次创建包含全部新增、覆盖和删除项的新 Tree 与 Commit。
7. 创建唯一 `publish/<slug>-<UTC时间>-<随机后缀>` 分支和 PR，再请求 squash auto-merge。

不同 slug 不修改共享 `pages.json`，可并行合并。同一 slug 的并行更新若冲突，交由 GitHub 阻止合并，不强推、不覆盖。

PR 创建失败时删除本次刚创建的分支。PR 已创建但无法启用 auto-merge 时保留 PR 供诊断，并输出 URL。

## 状态观察

脚本输出 PR URL、分支、提交和预期正式页面，但不把“PR 已创建”当作发布完成。后续通过 GitHub API：

1. 等待 `publish-check` 成功；
2. 确认 PR 已 squash 合并到 main；
3. 记录 merge commit；
4. 转入 Vercel 部署验证。

所有 Ref URL 使用：

```text
https://raw.githubusercontent.com/Koilato/StaticWebPage/main/references/<slug>/<逐段URL编码的文件路径>
```
