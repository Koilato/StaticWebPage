# GitHub API 发布

## 鉴权

`--dry-run` 可匿名读取公开仓库。`--pr` 依次使用 `GH_TOKEN`、`GITHUB_TOKEN`、`git credential fill` 返回的 GitHub HTTPS 凭据；无需安装 `gh`。凭据只留在进程内存，不得写入参数、日志、URL 或文件。受限沙箱看不到钥匙串时，为相同命令申请钥匙串和 GitHub 网络权限后重试，不要求用户复制令牌。

凭据需要 Contents、Pull requests 读写和 Actions 读取权限。仓库应启用 squash merge、auto-merge、合并后删除分支，并要求 `main` 的 PR 通过 GitHub Actions `publish-check`。

## 命令

```bash
npm run publish:page -- \
  --source <HTML文件或含index.html的目录> \
  --slug <slug> --title "<标题>" \
  [--description "<简介>"] [--tags "<标签1,标签2>"] \
  [--date YYYY-MM-DD] [--ref <文件或目录> ...] [--clear-ref] \
  --dry-run
```

方括号表示可选项，不原样输入。演练成功后，以完全相同的页面参数把 `--dry-run` 改为 `--pr`。

- `--source` 更新时替换整个页面目录。
- 省略 description、tags、date 时，更新保留旧值；新增使用标题、空标签和 UTC 当日。
- 出现 `--ref` 时用本次清单替换旧 Ref；省略则保留；`--clear-ref` 清空且不能与 `--ref` 同用。
- 不同 Ref 输入的顶层名称不能重复；`--dry-run` 与 `--pr` 必须且只能选择一个。

## 发布与观察

发布器先读取仓库设置、`main` ruleset、workflow 状态和完整 Tree；递归 Tree 截断时逐层读取。它在临时目录校验最终页面，扫描敏感内容，文本 Blob 使用 UTF-8、二进制使用 Base64，单文件超过 100 MiB 时拒绝。随后一次创建 Tree、Commit、唯一 `publish/<slug>-...` 分支、PR 和 squash auto-merge。

PR 创建失败时清理本次分支；auto-merge 失败时保留 PR 并报告 URL。不同 slug 可并行，同 slug 冲突交给 GitHub 阻止合并，不强推覆盖。

PR 创建不等于发布完成。等待 `publish-check` 成功与 squash 合并，记录 merge commit，再进入 Vercel 验收。所有 Ref 指向：

```text
https://raw.githubusercontent.com/Koilato/StaticWebPage/main/references/<slug>/<逐段URL编码路径>
```
