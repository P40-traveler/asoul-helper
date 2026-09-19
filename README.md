<h1 align="center">A-SOUL小助手-动态与直播提醒</h1>

<p align="center">
  <a href="https://github.com/P40-traveler/asoul-helper/stargazers" style="text-decoration:none">
    <img src="https://img.shields.io/github/stars/P40-traveler/asoul-helper.svg" alt="GitHub stars" />
  </a>
  <a href="https://github.com/P40-traveler/asoul-helper/forks" style="text-decoration:none">
    <img src="https://img.shields.io/github/forks/P40-traveler/asoul-helper.svg" alt="GitHub forks" />
  </a>
  <a href="https://github.com/P40-traveler/asoul-helper/blob/main/LICENSE" style="text-decoration:none">
    <img src="https://img.shields.io/badge/License-MIT-flat.svg" alt="GitHub license" />
  </a>
</p>

一个A-SOUL成员动态/直播提醒插件，在A-SOUL成员嘉然、乃琳、贝拉发布新动态或开始直播时，扩展会显示消息提醒，并可直接打开对应动态或直播间。连续写代码达到设定时长（默认1h）后，A-SOUL成员也会提醒你休息哦~

实现自定义用户查询，可以编辑`member.json`文件设置想要查询的B站用户。

使用轮询方式检测B站动态和直播，所以可能会有短暂的延迟（小于2min）。

## 插件使用与自定义

### 更改关注账号

1. 打开命令面板（`Ctrl+Shift+P`）。
2. 执行 `A-SOUL 提醒：打开成员配置`。
3. 编辑并保存 `member.json`。
4. 执行 `A-SOUL 提醒：立即检查` 验证配置。

`member.json` 示例：

```json
[
  {
    "uid": 3537115310721181,
    "name": "心宜",
    "dynamic": true,
    "live": true
  },
  {
    "uid": 3537115310721781,
    "name": "思诺",
    "dynamic": true,
    "live": true
  }
]
```

- `uid`：必填，B 站用户 UID。
- `name`：可选，提醒中显示的昵称。
- `dynamic`：可选，设为 `false` 可关闭该用户的动态提醒。
- `live`：可选，设为 `false` 可关闭该用户的直播提醒。

### 启用与关闭连续编码休息提醒

1. 打开命令面板（`Ctrl+Shift+P`）。
2. 执行 `首选项：打开设置(ui)`。
3. 搜索 `asoul notifier breakReminder:Enabled`。
4. 取消勾选 `连续编码达到设定时长后显示提醒` 。

## 设置

- `asoulNotifier.enabled`：启用或暂停自动监控。
- `asoulNotifier.pollIntervalMinutes`：轮询间隔，默认 2 分钟，最短 1 分钟。
- `asoulNotifier.dynamicMaxAgeMinutes`：动态发布时间限制，默认只提醒最近 30 分钟内发布的动态。
- `asoulNotifier.breakReminder.enabled`：启用连续编码休息提醒。
- `asoulNotifier.breakReminder.intervalMinutes`：连续编码多久后提醒，默认 60 分钟。
- `asoulNotifier.breakReminder.idleResetMinutes`：超过多久没有编辑后重新计时，默认 5 分钟。
- `asoulNotifier.breakReminder.popupStyle`：使用右下角通知或居中弹窗。
- `asoulNotifier.breakReminder.members`：选择参与随机提醒的嘉然、乃琳和贝拉。

“连续编码”按文本编辑活动计算。相邻两次编辑之间没有超过空闲阈值，这段时间会计入连续编码；超过空闲阈值后会开始新一轮计时。可以执行 `A-SOUL 提醒：预览休息提醒` 立即测试弹窗。

## 隐私与网络

扩展只读取 `member.json` 中的 B 站 UID，并直接请求 B 站公开网页接口。扩展不收集、上传或保存用户的 VS Code 工作区内容。

本项目依赖的 B 站网页接口并非面向扩展开发者的稳定公共 API，接口变更或风控可能暂时影响提醒。遇到问题可执行 `A-SOUL 提醒：查看运行日志`。

## 致谢

项目构想受到 [vscode-asoul-notifications](https://github.com/luooooob/vscode-asoul-notifications) 和 [A-SOUL 鼓励师](https://github.com/as042971/vscode-asoul) 启发。新版本重新实现了配置、轮询、去重、当前动态接口适配和基于编辑活动的连续编码计时。  
感谢曾为A-SOUL付出过真心的人。

## License

MIT
