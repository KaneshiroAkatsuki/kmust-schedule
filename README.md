# KUST·Lab

昆明理工大学呈贡校区研究生智能课表：实时课程状态、完整周课表、导师课提醒，以及电脑和手机之间的课表同步。

## 在线访问

- 网页：[https://kaneshiroakatsuki.github.io/kmust-schedule/](https://kaneshiroakatsuki.github.io/kmust-schedule/)
- 同步接口：`https://kmust-schedule-sync.kaneshiroakatsuki.workers.dev`

公开查看不需要登录。页面始终内置一份基础课表；云端或网络暂时不可用时，会自动使用最近一次缓存或内置数据，不影响查看时间和课程。

## 管理课表

1. 打开网页，点击顶部“添加课程”或“管理课表”；手机也可以使用底部“添加”。
2. 输入 Cloudflare 管理密码。
3. 新增、编辑、删除或导入课程；分段授课可以填写多组周次和教师。
4. 点击“保存全部修改到云端”。

密码只保存于当前浏览器会话，不写入网页或仓库。保存使用修订号检查；另一台设备已有更新时，页面会阻止覆盖并要求重新载入。

## 技术结构

- `index.html`：前端结构、交互和 37 门次离线兜底课表。
- `assets/kust-lab-v2.css`：手机、折叠屏、笔记本和外接显示器共用的响应式视觉系统。
- `cloudflare-worker/`：Cloudflare Worker API 与 D1 数据库配置。
- `test/frontend.test.mjs`：日期、课程、导师课、管理和响应式结构回归测试。

本项目为个人整理工具，并非昆明理工大学官方系统。课程、教室和临时调课请以学院及任课教师最新通知为准。
