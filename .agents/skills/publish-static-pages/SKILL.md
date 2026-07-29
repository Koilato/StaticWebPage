---
name: publish-static-pages
description: 在 StaticWebPage 仓库中新增、更新、替换或发布静态 HTML 页面及其 Ref 附件；包括维护页面界面、仓库登记、GitHub 发布和 Vercel 正式环境验证。用户要求处理该仓库的静态页面或附件时使用。
---
# 全局流程

1. 用户提供 HTML 和 Ref 文件 
2. AI 确定页面 slug 和文件存放位置，并生成ref文件的 GitHub Raw 链接
3. AI直接修改 HTML的名称为index.html，并在正文最后加入完整 Ref 章节，具体目录为：references/<slug>/
4. AI 上传 HTML 文件和ref文件 分别到src/pages/<slug>/index.html 和 references/<slug>/
5. 修改pages.json
6. Vercel 自动构建

# 静态页面发布

本文件是仓库静态页面工作的唯一入口。全程使用中文；只按当前任务读取下表所列的直接引用，不沿用其他发布说明。

后续命令一律在 `git rev-parse --show-toplevel` 返回的仓库根目录执行；该目录必须同时包含 `pages.json`、`package.json` 和 `vercel.json`。

## github仓库信息

- 仓库：`https://github.com/Koilato/StaticWebPage.git`
- 远端：`origin`
- 生产分支：`main`
- Raw 前缀：`https://raw.githubusercontent.com/Koilato/StaticWebPage/main/`

## 标准的仓库目录结构
 
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

## 提前准备的内容

开始前确定：

- 操作类型：新增页面，或更新已有页面；
- HTML 文件和ref文件来源；
- Ref 文件或目录；可以为空；
- slug；默认使用由HTML文件名称生成，如果为中文默认转为英文。
- pages.json：让构建脚本知道有哪些页面，并自动生成网站目录首页和 sitemap
- ref文件和静态html放置的位置


### slug规则

slug用于作为一个唯一索引号，必须要在初次运行时就确定好。

其中：
1. slug 发布后永久稳定，不因标题变化而修改，也不得复用给其他页面。
2. 纯中文标题需要转成为英文，再生成slug。
3. 不得自行使用拼音、序号或哈希。
4. slug样例：“network-tun-repair”
5. slug 必须匹配：^[a-z]+(?:-[a-z0-9]+)*$


### ref文件和html放置的规则

1. 正确提取出"slug"之后将这里的html改名为index.html 
2. html文件放在：“src/pages/<slug>/”内
3. html文件内如果有本地的静态资源，需要放在“src/pages/<slug>/assets/”并修改源代码中的链接
4. ref文件放在“references/<slug>/”内
5. 仓库地址为：`https://github.com/Koilato/StaticWebPage/tree/main/`,以此获取了完整的ref文件的链接地址，后面这个内容会放在html的ref的章节中


### pages.json规则

这是pages.json的标准范例，后续的内容需要使用append的方式追加

| 字段 | 要求 |
| --- | --- |
| `slug` | 唯一且符合 slug 规则 |
| `title` | 非空字符串 |
| `description` | 非空字符串 |
| `file` | 精确为 `src/pages/<slug>/index.html` |
| `publishedAt` | `YYYY-MM-DD` |
| `tags` | 无重复非空字符串数组 |

```json
[
  {
    "slug": "network-tun-repair",
    "title": "v2rayN TUN 网络修复",
    "description": "完整推理与操作记录",
    "file": "src/pages/network-tun-repair/index.html",
    "publishedAt": "2026-07-28",
    "tags": ["网络", "TUN", "故障排查"]
  },
]
```

其中
1.title,description,publishedAt,tags都需要ai阅读html生成
2.file字段:src/pages/<slug>/index.html


## 文件路由

| 文件 | 何时读取 | 是否必需 | 输入 | 输出 |
| --- | --- | --- | --- | --- |
| [编辑静态界面](references/edit-static-ui.md) | 新增 HTML，或改变已有页面的正文、样式、脚本、资源引用、Ref 区块 | 涉及 HTML 时必需 | 原 HTML、运行资源、Ref 清单 | 可直接入库的最终 HTML 与资源 |
| [GitHub 发布](references/github-publish.md) | 需要用 `publish:page` 新增，或需要提交、推送、生成 Raw 链接 | 发布到 GitHub 时必需 | 已校验的页面改动或新增命令输入 | `main` 上的提交与可访问 Raw 地址 |
| [Vercel 部署](references/vercel-deployment.md) | 已推送 `main`，需要等待并验证正式环境 | 对外发布时必需 | slug、本次提交、预期页面内容和 Raw 地址 | 正式页面与附件的验证结果 |

## 脚本路由

| 脚本 | 如何使用 | 作用 |
| --- | --- | --- |
| `scripts/publish-page.mjs` | 新增页面时只通过 `npm run publish:page -- ...` 调用 | 复制页面和附件、登记、校验、提交、推送并验证线上结果 |
| `scripts/preflight.mjs` | 只通过 `npm run publish:check` 调用 | 检查仓库身份、配置、测试、页面规则与构建结果；不提交、不推送 |
| 根目录 `scripts/site-utils.mjs` | 不直接运行 | 为校验和构建提供页面、资源与 Ref 规则 |
| 根目录 `scripts/site-utils.test.mjs` | 只通过 `npm test` 调用 | 验证 Ref 附件与 HTML 链接一一对应等负面场景 |
| 根目录 `scripts/validate.mjs` | 通常由 `publish:check` 间接调用 | 校验 `pages.json`、源页面、资源和 Ref |
| 根目录 `scripts/build.mjs` | 通常由 `publish:check` 或 Vercel 间接调用 | 重新生成 `dist/`、目录首页和 sitemap |

## 执行流程

1. 确认输入、操作类型和稳定 slug；遇到归属或 slug 冲突时停止并询问。
2. 按上表读取需要的文件，完成最终 HTML、资源和 Ref 设计。
3. **新增页面**只能依照 [GitHub 发布](references/github-publish.md) 使用 `publish-page` 流程（`npm run publish:page`），不得手工复制新页面或手工追加 `pages.json`。
4. **更新已有页面**不得运行 `publish:page`；直接修改该 slug 的现有源文件、附件和必要的 `pages.json` 字段，再运行 `npm run publish:check`，检查目标 diff 后按 GitHub 文档提交和推送。
5. 推送 `main` 后，按 Vercel 文档验证正式目录页、页面和全部 Raw 附件。

## 停止条件

出现以下任一情况，不得继续发布或声称成功：

- slug、页面归属或待替换内容无法唯一判断；
- 文件含凭据、令牌、Cookie、私钥、节点凭据或 `.env`；
- 无法把本次改动与工作区中的无关改动安全隔离；
- 校验、提交、推送或线上验证失败。

## 完成报告

仅在线上验证全部通过后，报告正式页面 URL、GitHub 仓库 URL、提交短 SHA 和 Ref 文件数量。若任务只要求本地修改，应明确说明尚未推送和部署。
