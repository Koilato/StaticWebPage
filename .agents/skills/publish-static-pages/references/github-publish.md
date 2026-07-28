# GitHub 发布

## 职责

本文件只规定 GitHub 目标、Raw URL、新增命令和 Git 提交流程。不定义页面目录树、Ref 模板或 Vercel 成功标准。

## 固定目标

- 仓库：`https://github.com/Koilato/StaticWebPage.git`
- 远端：`origin`
- 生产分支：`main`
- Raw 前缀：`https://raw.githubusercontent.com/Koilato/StaticWebPage/main/`

Raw URL 在此前缀后拼接附件的仓库相对路径。对路径中的每个段分别进行 UTF-8 百分号编码，保留 `/` 分隔符；不得使用 Vercel `/references/...`、GitHub blob 页面、其他分支或其他 slug。

例如仓库文件 `references/example-page/诊断 报告.pdf` 对应：

```text
https://raw.githubusercontent.com/Koilato/StaticWebPage/main/references/example-page/%E8%AF%8A%E6%96%AD%20%E6%8A%A5%E5%91%8A.pdf
```

## 新增页面的唯一命令

唯一入口是 `.agents/skills/publish-static-pages/scripts/publish-page.mjs` 对应的 npm 命令 `publish:page`。HTML 必须已经包含最终 Ref。新增 slug 先执行不提交、不推送的演练：

```bash
npm run publish:page -- \
  --source <HTML文件或含index.html的目录> \
  --slug <slug> \
  --title "<标题>" \
  [--description "<简介>"] \
  [--tags "<标签1,标签2>"] \
  [--date YYYY-MM-DD] \
  [--ref <Ref文件或目录> ...] \
  --dry-run
```

方括号表示可选参数，不应原样输入命令。参数行为如下：

| 参数 | 要求与默认值 |
| --- | --- |
| `--source` | 必需；一个 HTML 文件，或含 `index.html` 的目录 |
| `--slug` | 必需；必须符合 slug 规则，且页面目录、附件目录和登记中均不存在 |
| `--title` | 必需；页面标题 |
| `--description` | 可选；省略时使用标题 |
| `--tags` | 可选；逗号分隔，去除每项首尾空白；省略时为空数组 |
| `--date` | 可选；格式为 `YYYY-MM-DD`；省略时使用脚本运行时的 UTC 日期 |
| `--ref` | 可选且可重复；每项是文件或目录；省略时 Ref 文件数为零 |
| `--dry-run` / `--push` | 必须且只能选择一个 |

每个 `--ref` 输入以自身顶层名称复制；目录会递归复制。不同输入的顶层名称不得相同。
`--source` 和 `--ref` 输入应放在 Git 仓库工作树之外；脚本会拒绝仓库内造成的未跟踪或未提交输入，确保发布提交不混入来源文件。

演练成功后，用相同页面输入将模式改为 `--push`：

```bash
npm run publish:page -- <相同页面参数> --push
```

命令只接受全新 slug：它负责复制页面与附件、追加页面登记并执行 `npm run publish:check`。`--dry-run` 完成后会恢复 `pages.json`，删除本次创建的页面和附件路径，不提交或推送；发布前检查生成的 `dist/` 会保留为可重新生成的构建产物。

`--push` 只暂存本次 slug 的页面、附件和 `pages.json`，检查暂存 diff，以固定提交信息 `Publish <slug>` 提交并推送 `origin main`；随后逐字节轮询正式页面和每个 Raw 附件，直到全部与本地文件一致或验证失败。不得以手工复制或手工修改 `pages.json` 代替。

命令要求工作区（包括未跟踪文件）干净、当前为 `main`、`origin` 正确，且执行 `git fetch origin main` 后本地 `HEAD` 与 `origin/main` 同步。条件不满足时先停止，不能覆盖、混入或回退他人的改动。

提交前失败时，脚本恢复登记并删除本次创建的路径。提交完成后若推送或线上验证失败，本地提交会保留供诊断，不得把这种状态报告为发布成功。

## 更新已有页面

`publish:page` 不处理更新。直接修改已有 slug 的文件后执行：

```bash
npm run publish:check
git status --short
git diff --check
git diff
```

确认校验通过、`dist/` 和敏感信息未进入改动、diff 仅包含本次目标后，只暂存相关文件：

```bash
git add <本次相关文件>
git commit -m "<准确描述本次更新>"
git push origin main
```

不得使用宽泛暂存把无关改动带入提交，不得把令牌写入远端 URL，也不得修改 Git 全局凭据。

## 输出

`--dry-run` 成功时输出页面路径和 Ref 文件数量，并明确未提交或推送。`--push` 成功时输出正式页面 URL、完整提交 SHA 和 Ref 文件数量；全部规范 Raw URL 可由固定前缀、slug 和附件路径确定，交给部署验证。
