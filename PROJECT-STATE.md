# 项目现状与接手说明（新会话从这里开始）

> 这份文件是给"下一个我"看的。上下文会滚掉，**文件不会**。
> 最后更新：2026-10-20 —— **v1.0.0 第一个大版本**：撞墙惩罚、磁铁 / 烟花 / 护盾三种道具、道具发光、buff 挂身特效、HUD buff 行、手机轻点跳过演出、影子抖动修复。已推送到 `origin/master` 并由 GitHub Actions 发布到 `https://pjh060602.github.io/naiwa-runner/`。

## 零、一分钟看懂当前状态（新会话先读这段）

| 项 | 值 |
|---|---|
| 代码位置 | `game/`（TypeScript + Vite + Three.js，无后端） |
| 本地分支 / 最新提交 | `master`（版本 `1.0.0`，最新提交看 `git log -1`） |
| 远端 / 线上 | `origin = https://github.com/pjh060602/naiwa-runner.git`；线上 `https://pjh060602.github.io/naiwa-runner/`（GitHub Pages，Source = GitHub Actions） |
| 能跑吗 | 能：`cd game && npm run play` → http://localhost:5173/ |
| 类型/逻辑/构建 | `npx tsc --noEmit` · `npm run verify:logic`（45 条断言全 PASS）· `npm run build` |
| 已知未修问题 | 见「八、待办」第 2 条（总开关已修，当前无已知 P0） |
| 上传内容 | 只有 92 个文件 / 约 2.9 MB（`game/` + `docs/` + `.github/` + `PROJECT-STATE.md` + `.gitignore`）；`.git` 本地已瘦身到 3.1 MB |

### 代码地图（改东西先看这里，别乱翻）

```
game/src/
  game.ts          主循环、状态机（boot/menu/intro/running/caught/result）、难度、暂停、结算、音效触发
  main.ts          启动引导、标题页（splash）开关、game-ready
  audio/audio.ts   全部音频：合成音效、BGM 调度器、心跳床、台词片段、总开关 setMuted
  core/            config.ts（数值/难度表）、input.ts（键盘+滑动）、loop.ts、assets.ts、palette.ts
  player/          player.ts（跑跳滑铲/肚皮滑行）、collision.ts、rig.ts
  character/       chaser.ts（袋鼠换肤 setSkin）、naiwa-*.ts（奶蛙纸片人）
  world/           track.ts（跑道+栏杆）、park.ts（道具流）、director.ts（障碍节奏）、buff-fx.ts（磁铁/护盾/飞行挂身特效）、
                   obstacles.ts、collectibles.ts（奶瓶 + 道具对象池 + 道具发光）、stage.ts（演出）、glow.ts、
                   props/**（场景美术；props/items.ts = 磁铁/火箭/骑士盾模型）、backdrop/**（海天远景）
  ui/              menu.ts（菜单/难度/历史/换肤/教程/滚动指示器）、overlay.ts（结算）、hud.ts
game/public/models/  奶蛙与袋鼠贴图（含 kang_gdut_tex.png 广工袋鼠）
game/public/audio/   笑声与袋鼠台词 mp3
game/scripts/verify-logic.ts  无浏览器逻辑断言（碰撞矩阵/演出时间轴/栏杆回归等 45 条）
```

### 迭代约定（用户明确要求继续更新）

1. 改完必跑三连：`npx tsc --noEmit` / `npm run verify:logic` / `npm run build`；涉及碰撞盒、跳跃/滑铲时序、演出时间轴的改动必须让 verify:logic 继续全绿。
2. 视觉/交互改动要给出**可量化证据**（元素 rect、无重叠、无横向溢出、双视口截图），别只说"看起来好了"。
3. 手机兼容：`dvh` 一律配 `vh` 兜底（老 iOS Safari / 安卓 WebView 不支持 dvh，会让高度限制整条失效）。
4. 提交前确认 `.gitignore` 覆盖新增的本地产物；不要提交 `.venv-ml/`、`.tmp/`、`shots/`、`game/dist/`。

### v1.0 新增玩法（改数值先看这里，别和回归基线打架）

| 机制 | 规则 | 关键常量（`core/config.ts`） |
|---|---|---|
| 撞墙 | 第一/第三跑道继续向外平移＝撞障碍；护盾可挡 | `WALL_BUMP_COOLDOWN = 0.6` |
| 磁铁 | 10s 内 8m 范围奶瓶被吸向玩家并计数 | `MAGNET_TIME = 10`、`MAGNET_COLLECT_RADIUS = 0.75` |
| 烟花 | 3s 超高速（约 3×）冲刺，穿障碍无敌；拾取瞬间把追兵甩到最远 | `FIREWORK_TIME = 3` |
| 护盾 | 抵挡任意一次撞击（含撞墙）：不扣距离、不加撞击、**不减速**，破碎 0.4s 无敌 | `SHIELD_BREAK_INVULN = 0.4` |
| 撞墙回弹 | 撞到跑道边缘时身体朝栏杆顶出约 0.3m 再弹回（纯视觉，不改碰撞盒） | `BUMP_NUDGE`（player.ts） |
| 道具刷新 | 低概率随机，三种均等，间隔 190–360m | `ITEM_GAP = [190, 360]`、`ITEM_FIRST_Z = -140` |

**障碍分档权重铁律**：`world/director.ts` 的 `WEIGHTS` 里，near / mid / dense 三档都必须同时保留「只能跳」和「只能滑铲」两类解法。
v1.0.3 之前 dense 档漏了 `fence`（高门架 = 游泳圈木架子），导致 900m 之后这类障碍彻底消失；现在 `npm run verify:logic` 有断言守着。

**新增 `scripts` 之外的验收脚本注意**：改 `collectibles.ts` 的 `ItemField` 时，node 环境没有 `document`，发光层已用 `typeof document !== 'undefined'` 守卫，别去掉。

## 一、这是什么

「奶蛙快跑」，一款海滨跑酷网页游戏。Three.js + TypeScript + Vite，纯静态无后端。
用户定位：**个人练手 / 非商用**。

## 二、现在能不能玩

能。

```
cd game && npm install
npm run play          # 本地开发服务器（改代码即时生效，推荐日常玩这个）
```

- 电脑：http://localhost:5173/
- 手机（同 WiFi）：http://<本机局域网 IP>:5173/

想验证「线上那套」就构建后跑子路径预览：

```
cd game && npm run build && npm run preview:pages
# 打开 http://localhost:4187/naiwa-runner/   ← 子路径不能省
```

**坑（已踩过）**：生产构建的 base 是 `/naiwa-runner/`（GitHub Pages 项目站点）。
用一个 base 为 `/` 的服务器（例如 `npx vite preview` 直接起在根）去开根路径，
浏览器会去取 `/naiwa-runner/assets/*.js` 拿到 HTML 回退 ⇒ 白屏/点不动的假故障。
本地玩一律用 `npm run play`，验证线上用 `npm run preview:pages` + 带子路径的地址。

**手机真机已验证过一次**（用户自己玩的，反馈"还可以"）。

## 三、当前数值

| 项 | 值 | 预算 |
|---|---|---|
| 三角面 | 约 95k | 120k |
| draw call | 约 89 | 120 |
| fps | 103–144 | ≥60 |
| 16 件道具 | 5242 tris | — |
| 大背景 | 3706 tris / 5 draw call | — |

## 四、团队与文件边界（重要，别越界）

| 角色 | 拥有 | 不许碰 |
|---|---|---|
| **runner-core** | park.ts 布局、obstacles.ts 碰撞、track.ts、game.ts 演出/音频/UI/menu | world/props/**、world/backdrop/**、character/** |
| **scene-artist** | world/props/**、world/backdrop/**、props-preview.html | 上面那些，以及一切逻辑 |
| **lighting-artist** | world/lighting.ts、world/shadow.ts、lighting-preview.html | 其余全部（由 runner-core 接线） |
| **lead（我）** | character/**、材质贴图、docs/、验收 | — |

**铁律**：不许写对方的文件；需要对方改就报 lead 转达；每次动手前先跑 `npx tsc --noEmit`，红了且不是自己的文件就报 lead，别自己上手。

## 五、关键约束（改之前必须知道）

1. **角色是单面纸片人，正面朝 +Z**。相机必须在 +Z 侧；不要让模型转 Y 去"面对"别人，否则背面剔除会导致角色消失。
2. **贴图必须设 `colorSpace = SRGBColorSpace`**，否则颜色被二次编码、整体发灰——这是用户说"褪色"的根因。
3. **源图自带 alpha 时，用 alpha 做遮罩，不要自己按颜色算**。按颜色算会切掉贴轮廓的眼睛、并把透明区的黑色当成主体（黑块）。
4. **碰撞盒尺寸与解法是回归基准**。换美术皮不许动 halfWidth/halfDepth/minY/maxY/answer，`npm run verify:logic` 会验。
5. **演出由音频 ended 驱动**，不许 setTimeout 硬编码时长。
6. **世界必须跟着玩家走**：地面盘、天空穹顶、海面、沙带都要按玩家 x/z 跟随，否则跑远会看到世界边界、穹顶被相机远平面切出巨大三角。
7. **报告必须附回读证据**（grep 行 + 内容），否则"报告"和"文件实际状态"的时间差会让验收方误判。
8. **预算贴顶就停手**：棕榈 1154/1200、长椅 444/450。

## 六、验证入口

```
cd game
npx tsc --noEmit      # 类型
npm run verify:logic  # 全部断言：碰撞矩阵 / 落地滑铲 / 二段跳 / 演出时间轴 / CAUGHT 同框 / 相机 / 排行榜
npm run build         # 生产构建
```

调试参数：
| 参数 | 作用 |
|---|---|
| `?seed=N` | 固定关卡 |
| `?bot=1` | 自动驾驶长跑 |
| `?chaser=N` | 直接设定追兵距离 |
| `?gallery=<kind>` | 只看某一种障碍 |
| `?stage=caught&t=line\|laugh` | 定格在结局演出的某一段 |
| `?cam=side` | 侧向机位 |
| `?char=billboard` | 切回纸片人（现在默认就是它） |

## 七、已完成的功能

- 三车道跑 / 跳 / **二段跳** / 滑铲 / **肚皮滑行** / 换道
- 追兵：撞一次拉近 4m，被追上才死
- 五种障碍（沙滩椅 / 系船柱 / 遮阳棚横杆 / 路标 / 海鸥），各有唯一解法
- 海滨公园场景：棕榈 / 栏杆 / 沙滩 / 海面 / 遮阳伞 / 躺椅 / 救生塔 / 远岛 / 云 / 102 个沙滩小物件
- 开场演出：奶蛙捧腹大笑 → 袋鼠说台词 → 变露肚 → 开跑（每局都有）
- 结局演出：两人定格 → 袋鼠说台词 → 奶蛙大笑 → 结算（每局都有）
- 菜单 / 设置 / 历史纪录（本地，最近 10 条 + 最高纪录高亮，每条标难度，<50m 不入纪录）
- 难度三档：休闲（速度 ×0.8、追兵 22m、撞击拉近 3m、障碍更疏、BGM 0.9）/ 标准（原基线）/ 硬核（×1.2、14m、5m、更密、BGM 1.1）
- 暂停：Esc 或右下角 ⏸ → 继续 / 重开 / 回主菜单；暂停期间计时与逻辑全冻结；切后台自动暂停
- 音效：真笑声 + 用户录的袋鼠台词 + 合成音效；换道 whoosh、滑铲摩擦、肚皮滑行、袋鼠现身咆哮（180→90Hz + 900→380Hz 带通 + 1.6kHz 瞬态）
- 危险区单一化：不再有「心跳预警区」，只剩「袋鼠出现」这一个边界（休闲 4m / 标准 5m / 硬核 6m＝该难度拉近距离 +1m），越过即 HUD 变红 + 镜头拉远 + 袋鼠入画 + 咆哮
- 危险区持续音＝「扑通扑通」心跳：150Hz 重拍 + 0.22s 后 185Hz 轻拍，轮间隔 1.0s→0.75s 随距离收紧，已删除 96Hz 主音与噪声底噪（实测 100Hz 低通峰值 0.053，两拍间隔 0.22/0.97 交替）
- 标题页：日落渐变封面，「按任意键 / 点击屏幕 进入」+「进入游戏」按钮，双条件关闭（已触发 且 body.game-ready），首帧即成品（内联关键样式）
- 袋鼠换肤：主菜单「切换形象」→ 袋鼠栏目两张卡片（美团袋鼠＝默认 / 广工袋鼠），切换即时生效并持久化（Settings.chaserSkin）
- 引导教程页：主菜单独立入口，含基础操作 / 进阶技巧 / 三难度距离表 / 追逐机制；标题与「返回」固定、只有内容区滚动
- 结算界面：标题「被追上了」+ 大号距离 + 四项数据 + 「再跑一次 / 返回主菜单」两个按钮（不再点任意处重开）
- BGM：纯 Web Audio 合成的 96bpm 海岛循环（拨弦/沙锤/贝斯/口哨），AudioContext 时间轴 lookahead 排程，随难度 0.9/1.0/1.1 变速
- 视觉：海滨日落玻璃拟态（磨砂玻璃面板、暖橙主按钮三态、难度胶囊、氛围层仅菜单期显示）
- 启动即主菜单：首帧就是「日落渐变 + 主菜单」，无黑屏过渡；音频仍按首次真实交互解锁
- 手机：只保留滑动手势 + 暂停钮（虚拟按键与游戏内底部按键提示已按用户要求移除；玩法说明只在主菜单）
- 部署：`vite base=/naiwa-runner/` + GitHub Actions 自动构建发布 Pages（见 docs/上线部署说明.md）

## 八、待办（按优先级）

1. **上线**：用户在 GitHub 上删掉了 `naiwa-runner` 仓库，需要重建空仓库 → `git remote add origin`（本地 origin 仍指向旧地址）→ push → Settings→Pages 选 GitHub Actions。
2. **已知 bug（未修）**：设置里的「总开关」只静音了 sfx，BGM 与心跳床接在 master 上，关掉总开关仍会响。
3. **移动端兼容**：已给所有 `dvh` 加 `vh` 兜底（老版 iOS Safari / 安卓 WebView 不支持 dvh，会让面板高度限制失效、按钮被顶出屏幕）。
4. **光影系统接线**（历史遗留，lighting-artist 的 `lighting.ts`+`shadow.ts` 仍未接）。
5. **第 7 条（用户原话）**：多玩几遍找 bug、大幅度优化手感、优化代码。
6. 内容量（障碍种类、第二场景）—— 用户明确说**放很后面**。

## 九、素材出处与授权

| 素材 | 来源 | 授权 |
|---|---|---|
| 奶蛙立绘 / 大笑 / 侧躺 / 挥手 | github.com/Nailong-Studio/wallpaper | 仓库标注 MIT |
| 袋鼠形象 | 小红书公开表情包 | 仅非商用 |
| 袋鼠台词 | 用户提供视频中提取 | 用户提供 |
| 广工袋鼠形象 | 用户提供的 `广工袋鼠.png`（含「豆包AI生成」水印） | 用户提供；已抠图存为 `game/public/models/kang_gdut_tex.png` |
| 捧腹大笑音效 | 第三方应用解压提取（未运行） | 仅非商用 |

**整体非商用**。架构上玩法与形象已解耦，要商用需换皮。

## 十、沟通约定（对用户）

- 用户**看不到聊天里的图片附件**，要看图必须存到工作区并 `Invoke-Item` 打开。
- 已定的产品决策（别再反复问）：排行榜改成「历史纪录」只和自己比、不分难度栏、不要昵称；在线排行榜**不做**，数据只存本地；手机只用滑动 + 暂停钮，不要虚拟按键；游戏内不显示按键指引，操作说明只放主菜单；打开网页必须直接是主菜单，不允许任何黑屏过渡。
- 用户偏好：直接、要证据、不要自我表扬；指出问题要具体。
- 用户说过「内容量放很后面」「3D 建模全部作废、以后都用纸片人」——这两条是定案，别再提。
