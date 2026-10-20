# 项目现状与接手说明（新会话从这里开始）

> 这份文件是给"下一个我"看的。上下文会滚掉，**文件不会**。
>
> **状态：v1.0 第一个大版本已定稿，制作暂时告一段落（2026-10-20）。**
> 代码已推送到 `origin/master`，GitHub Actions 自动发布到 https://pjh060602.github.io/naiwa-runner/
> 版本线约定：**整个 v1.0.x 都属于「第一个大版本」**，以后要动继续在 v1.0.x 里改，不升大版本号。

## 零、一分钟看懂当前状态

| 项 | 值 |
|---|---|
| 代码位置 | `game/`（TypeScript + Vite + Three.js，纯静态无后端） |
| 版本 | `1.0.7`（第一个大版本 v1.0 的定稿补丁位） |
| 本地 / 远端 | `master` ↔ `origin/https://github.com/pjh060602/naiwa-runner.git`，标签 `v1.0.0`…`v1.0.7` + `v1.0` |
| 线上 | https://pjh060602.github.io/naiwa-runner/ （Pages，Source = GitHub Actions） |
| 能跑吗 | 能：`cd game && npm install && npm run play` → http://localhost:5173/ |
| 三连检查 | `npx tsc --noEmit` · `npm run verify:logic`（**49 条断言全 PASS**）· `npm run build` |
| 仓库体积 | 跟踪 100 个文件 / 约 3.9 MB；`.git` 约 3.9 MB |
| 已知 P0 | 无 |

### 代码地图（改东西先看这里）

```
game/src/
  game.ts          主循环、状态机（boot/menu/intro/running/caught/result/revive）、难度、暂停、结算、
                   复活流程（startRevive / enterReviveLaugh / enterReviveLine / finishRevive）、音效触发
  main.ts          启动引导、标题页 splash、game-ready
  audio/audio.ts   全部音频：合成音效、BGM 调度器（96bpm）、心跳床、台词/笑声音频片段 playClip、总开关 setMuted
  core/            config.ts（数值/难度表/音频片段常量）、input.ts（键盘 + 滑动 + tap/revive 意图）、loop.ts、assets.ts、palette.ts
  player/          player.ts（跑跳滑铲/肚皮滑行/撞墙信号/飞行）、collision.ts、rig.ts（NaiwaState 含 'fly' / 'ascend'）
  character/       chaser.ts（袋鼠换肤 setSkin）、naiwa-billboard.ts（纸片人 6 张状态贴图）、naiwa-types.ts
  world/           track.ts、park.ts、director.ts（障碍节奏 + 分档权重）、buff-fx.ts（磁铁/护盾/飞行挂身特效）、
                   obstacles.ts、collectibles.ts（奶瓶 + 道具池 + 道具发光层）、stage.ts（开场/结局演出姿态）、
                   glow.ts、naiwa-texture.ts（奶蛙贴图覆盖：laugh/fly/ascend）、
                   props/**（场景美术；props/items.ts = 磁铁/火箭/骑士盾）、backdrop/**（海天远景）
  ui/              menu.ts（菜单/难度/历史/换肤/教程/滚动指示器/历史复活标记）、overlay.ts（结算 + 复活按钮）、hud.ts
game/public/models/  奶蛙 front/laugh/slide/jump/fly/ascend 六张贴图 + 袋鼠 meituan/gdut 两张
game/public/audio/   laugh_full/mid/short、kang_line、ascend（升天音效，2 倍速 2.62s）
game/public/refs/    美术参考图（被跟踪，别删）
game/scripts/verify-logic.ts  无浏览器断言：碰撞矩阵 / 跳跃滑铲时序 / 演出时间轴 / 相机 / 栏杆回归 / 障碍分档权重
```

### 迭代约定

1. 改完必跑三连：`npx tsc --noEmit` / `npm run verify:logic` / `npm run build`；碰到碰撞盒、跳跃/滑铲时序、演出时间轴的改动必须让 verify:logic 继续全绿。
2. 视觉/交互改动给**可量化证据**（元素 rect、无重叠、无横向溢出、视口截图），别只说"看起来好了"。
3. 手机兼容：`dvh` 一律配 `vh` 兜底；`#id` 规则要配 `.hidden` 覆盖，否则 `display` 优先级会盖掉隐藏。
4. 提交前确认 `.gitignore` 覆盖本地产物；不要提交 `.venv-ml/`、`.tmp/`、`shots/`、`game/dist/`。

## 一、这是什么

「奶蛙快跑」，海滨跑酷网页游戏（Three.js + TypeScript + Vite，纯静态无后端）。个人练手 / **非商用**。
玩法：三车道跑酷，躲障碍吃奶瓶，身后袋鼠追，撞一次拉近，被追上结束（可复活）。

## 二、怎么跑 / 怎么上线

```
cd game && npm install
npm run play                                   # 本地开发（改代码即时生效）
npm run build && npm run preview:pages         # 验证线上形态：http://localhost:4187/naiwa-runner/
```

**上线**：push 到 `master` 即触发 `.github/workflows/deploy-pages.yml`（构建 + 发布 Pages）。详细说明见 `docs/上线部署说明.md`。

**坑（踩过）**：生产构建 base 是 `/naiwa-runner/`。用 base 为 `/` 的服务器打开根路径会取不到资源 ⇒ 白屏。本地玩用 `npm run play`，验线上用 `npm run preview:pages` 且地址必须带子路径。

## 三、v1.0 定稿内容（做什么了）

### 玩法
- 三车道跑 / 跳 / **二段跳** / 滑铲 / **肚皮滑行** / 换道
- 追兵：撞一次拉近 `hitPull`（3/4/5 m），被追上结束；距离开局每秒恢复 0.35 m
- **撞墙惩罚**：第一/第三跑道继续向外平移＝撞障碍（拉近 + 撞击 +1 + 踉跄 0.35s），0.6s 冷却；护盾可挡
- **撞墙回弹**：撞边缘时身体朝栏杆顶出约 0.3m 再弹回（纯视觉，不改碰撞盒）
- **三种道具**（低概率随机，间隔 190–360m，跑道上带发光）
  - 磁铁：10s 内 8m 范围奶瓶被吸向玩家并计数
  - 烟花：3s、约 3× 冲刺、穿障碍无敌、落地 0.5s 缓冲；拾取瞬间把袋鼠甩到最远
  - 护盾：挡任意一次撞击（含撞墙），不扣距离 / 不加撞击 / **不减速**，破碎 0.4s 无敌
- **复活**：被追上后可点「复活继续」或按 **V / Enter**，**不限次数**；里程/奶瓶/用时/速度全部保留，只把袋鼠甩回最远
  - 演出：奶蛙升天贴图 + 随音效持续上飘 2.0m（音效播完才复位）→ 捧腹大笑 → 袋鼠说「你的胆子真是肥嘟嘟的」→ 继续跑
  - 演出期间袋鼠始终在画面里（正面 3/4 双人机位）；任意键 / 轻点可跳过；总时长约 6.4s
  - **记录规则**：只保留「复活前」那次死亡的纪录并标「复活前」；复活后的成绩不写入，但照样弹结算面板

### 演出 / 音频
- 开场演出：奶蛙捧腹大笑 → 袋鼠台词 → 变露肚 → 开跑
- 结局演出：两人定格 → 袋鼠台词 → 奶蛙大笑 → 结算
- BGM：纯 Web Audio 合成 96bpm 海岛循环，随难度 0.9/1.0/1.1 变速
- 音效：真笑声 + 用户录的袋鼠台词 + 合成音效（换道/滑铲/肚皮滑行/咆哮/扑通扑通心跳/三种道具/破盾/升天）

### 界面
- 标题页：日落渐变封面 +「进入游戏」+「按任意键 / 点击屏幕 进入」，双条件关闭，首帧即成品
- 主菜单：开始 / 引导教程 / 切换形象 / 历史纪录 / 设置（总开关、BGM、音效、语音、难度）
- 引导教程：基础操作 / 进阶技巧 / 难度距离表 / **难度随距离提升** / **复活机制** / 追逐机制
- 历史纪录：只和自己比（最近 10 条 + 最高纪录高亮；每条标难度；<50m 不入纪录；复活局标「复活前」）
- 结算：大号距离 + 用时/奶瓶/撞击/历史最高 + 小号「复活继续」+「再跑一次 / 返回主菜单」
- 暂停：Esc 或右上角 ⏸；切后台自动暂停
- 手机：只保留滑动手势 + 暂停钮；轻点屏幕可跳过演出

### 视觉
- 海滨公园：棕榈 / 栏杆 / 沙滩 / 海面 / 遮阳伞 / 躺椅 / 救生塔 / 远岛 / 云 / 102 个沙滩小物件
- 奶蛙纸片人 6 张状态贴图（正面 / 大笑 / 滑铲 / 跳跃 / 飞行 / 升天），袋鼠 2 张（美团 / 广工）
- 道具模型：红蓝马蹄磁铁 / 小火箭 / 西方骑士三角盾（three.js 自带几何 + 顶点色合并，单件 ≤260 tris）
- buff 挂身特效：磁铁金环 + 环绕粒子 + 极淡辉光；护盾 fresnel 球壳 + 碎片池；飞行气流（全部挂在 `rig.root` 下，实测位置差 0.000）

## 四、关键数值（改之前先看）

| 机制 | 规则 | 常量（`core/config.ts`） |
|---|---|---|
| 速度 | 14 m/s 起，指数逼近 30（休闲 ×0.8 / 硬核 ×1.2） | `SPEED_BASE/GAIN/TAU`、`DIFFICULTY.speedScale` |
| 障碍分档 | <400m 间距 32–46m；400–900m 22–32m；≥900m 15–23m | `GAP_NEAR/MID/DENSE`、`TIER_NEAR_END/TIER_MID_END` |
| 节奏事件 | 每 250m 连续 3 个同类障碍（间隔 15m） | `RHYTHM_EVERY/COUNT/GAP` |
| 双连障碍 | 900m 之后每个障碍位 45% 概率双车道来车 | `DOUBLE_OBSTACLE_CHANCE` |
| 道具体验 | 间隔 190–360m，三种均等 | `ITEM_GAP`、`ITEM_FIRST_Z` |
| 磁铁 | 10s / 半径 8m，吸到 0.75m 计数 | `MAGNET_TIME`、`MAGNET_RADIUS`、`MAGNET_COLLECT_RADIUS` |
| 烟花 | 3s / 3× / 落地 0.5s 缓冲 | `FIREWORK_TIME`、`FIREWORK_SPEED_MULT`、`FIREWORK_LANDING_GRACE` |
| 护盾 | 破碎后 0.4s 无敌 | `SHIELD_BREAK_INVULN` |
| 撞墙 | 0.6s 冷却 | `WALL_BUMP_COOLDOWN` |
| 复活 | 升天 2.6s + 短笑声 1.6s + 台词 2.17s（≈6.4s） | `game.ts` 的 `ASCEND_SECONDS/LIFT` |

**障碍分档权重铁律**：`world/director.ts` 的 `WEIGHTS` 里，near / mid / dense 三档都必须同时保留「只能跳」和「只能滑铲」两类解法。
（v1.0.3 之前 dense 档漏了 `fence`，导致 900m 后只能滑铲的高门架彻底消失；现在 verify:logic 有断言守着。）

## 五、关键约束（改之前必须知道）

1. **角色是单面纸片人，正面朝 +Z**。相机必须在 +Z 侧；不要让模型转 Y 去"面对"别人，否则背面剔除会让角色消失。
2. **贴图必须 `colorSpace = SRGBColorSpace`**，否则颜色被二次编码、整体发灰（用户说"褪色"的根因）。
3. **源图自带 alpha 时用 alpha 做遮罩**；按颜色算会切掉轮廓内的眼睛、把透明区黑色当主体。
4. **碰撞盒尺寸与解法是回归基准**（halfWidth/halfDepth/minY/maxY/answer），换皮不许动。
5. **演出由音频 ended 驱动**，不要 setTimeout 硬编码时长。
6. **世界要跟着玩家走**（地面盘/穹顶/海面/沙带），否则跑远会看到世界边界。
7. **所有挂身特效 / 影子必须挂在 `rig.root` 或使用渲染插值后的坐标**：用 60Hz 模拟坐标会滞后抖动（v1.0 踩过 0.44m 偏差）。
8. **HUD/结算文案改动要给出实测**，别只改代码。
9. 预算贴顶就停手（棕榈 1154/1200、长椅 444/450）。

## 六、验证入口与调试参数

```
cd game
npx tsc --noEmit      # 类型
npm run verify:logic  # 49 条断言：碰撞矩阵 / 落地滑铲 / 二段跳 / 演出时间轴 / CAUGHT 同框 / 相机 / 排行榜 / 栏杆 / 分档权重
npm run build         # 生产构建
```

| 调试参数 | 作用 |
|---|---|
| `?seed=N` | 固定关卡 |
| `?bot=1` | 自动驾驶长跑 |
| `?chaser=N` | 直接设定追兵距离 |
| `?gallery=<kind>` | 只看某一种障碍 |
| `?stage=caught&t=line\|laugh` | 定格结局演出某一段 |
| `?cam=side` | 侧向机位 |

## 七、遗留与后续方向（按价值排序）

1. **光影系统接线**：`world/lighting.ts` + `world/shadow.ts` 仍未被 game.ts 使用（历史遗留）。
2. **PWA**：加 manifest + service worker，可"添加到主屏幕"离线玩；也能绕开内置浏览器的音频限制。用户之前没要，属于可选。
3. **手感优化**：多玩几遍找 bug、调速度曲线与容错窗口（用户原话）。
4. **内容量**：更多障碍种类 / 第二场景（用户明确说放很后面）。
5. **音效素材**：升天音效目前是 2 倍速版本（用户提供的 mp4 原速 5.25s），若觉得变调可换原速 + 剪短。
6. **复活演出**：当前世界在演出期间冻结；若以后想让演出时背景继续流动，需要单独处理 track/park 的推进。

## 八、素材出处与授权

| 素材 | 来源 | 授权 |
|---|---|---|
| 奶蛙立绘 / 大笑 / 侧躺 / 挥手（前 4 张贴图） | github.com/Nailong-Studio/wallpaper | 仓库标注 MIT |
| 奶蛙飞天 / 升天形象 | **用户提供**（`奶蛙飞天 .jpg`、`奶蛙升天.jpg`，工作区保留） | 用户提供 |
| 升天音效 | **用户提供**（`奶蛙升天音效.mp4`，工作区保留；转成 `audio/ascend.mp3`） | 用户提供 |
| 袋鼠形象 | 小红书公开表情包 | 仅非商用 |
| 袋鼠台词 | 用户提供视频中提取 | 用户提供 |
| 广工袋鼠形象 | 用户提供的 `广工袋鼠.png`（含「豆包AI生成」水印）→ 已抠图存为 `game/public/models/kang_gdut_tex.png` | 用户提供 |
| 捧腹大笑音效 | 第三方应用解压提取（未运行） | 仅非商用 |

> 注：`广工袋鼠.png` 原始素材在 v1.0 收尾清理时被误删；**游戏用的抠图贴图已在 git 里**，不影响运行。

**整体非商用**。玩法与形象已解耦，要商用需换皮。

## 九、沟通约定（对用户）

- 用户**看不到聊天里的图片附件**，要看图必须存到工作区并 `Invoke-Item` 打开。
- 已定的产品决策（别再反复问）：历史纪录只和自己比、不分难度栏、不要昵称、不做在线排行榜；手机只用滑动 + 暂停钮；游戏内不显示按键指引；打开网页必须直接是主菜单不允许黑屏；危险区只有「袋鼠出现」一个边界（咆哮 + 扑通扑通心跳，不要低频铺底）。
- 用户偏好：直接、要证据、不要自我表扬；问题要指到具体文件和数值。
- 已定案别再提：内容量放很后面、3D 建模全部作废（都用纸片人）、微信内置浏览器音频问题不再处理。
