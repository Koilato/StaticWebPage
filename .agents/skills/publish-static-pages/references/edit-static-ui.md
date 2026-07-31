# 编辑静态界面

产出可入库、可独立静态运行的最终页面。保留用户的信息层级、视觉语言和交互意图，只做任务所需改动；HTML、CSS、JavaScript、字体和图片必须随页面提供或使用可靠远端地址。

## Ref

页面应有唯一且闭合的 `<main>`，以及位于 `</main>` 前、作为最后一个 section 的唯一 `section#ref`。若正文边界不明确，不得机械包装，应先询问用户。

Ref 文件使用逐段 URL 编码的正式地址：

```text
https://raw.githubusercontent.com/Koilato/StaticWebPage/main/references/<slug>/<文件路径>
```

有附件时，每个文件使用独立 `li`，包含非空名称、用途说明和链接：

```html
<section id="ref">
  <h2>Ref</h2>
  <ul><li><a href="<Raw URL>" target="_blank" rel="noopener noreferrer">文件名</a><p>用途</p></li></ul>
</section>
```

没有附件时仍保留 Ref，并写明“暂无关联文件”。样式可以沿用页面设计，但附件目录中的每个文件必须恰好出现一次。

完成后检查相对资源、桌面与窄屏布局、键盘操作、控制台错误和核心交互；不得留下缺失资源、本机绝对路径、临时地址或敏感信息。
