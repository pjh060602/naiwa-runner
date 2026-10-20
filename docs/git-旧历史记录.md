# 旧 git 历史记录（已清理，仅存档）

2026-10-20 清理工作区时，本地仓库里有两条分支指向**被污染的旧历史**（那次误把 `.venv-ml`（Python+PyTorch 环境，32,510 个文件）提交进版本库，导致 `.git` 膨胀到 2.5 GB）。

当前发布用的 `master` 是一条**干净的单提交历史**，包含游戏的全部源码与资源；下面这些旧分支里的代码改动都已经在 `master` 的代码树里，删掉不丢代码，只丢旧的提交记录。

## 清理前两条分支的尖端提交

```
### keep-current
7b4a6de5 fix: remove stray dead fronds from palm crown
bcd70d36 fix: route dialogue and laugh clips outside sfx bus
391a47a1 test: playtest now captures 4 frames (menu/running/jump/slide) for visual review
e991c15f test: automated playtest harness driving the browser via bsk CLI (audio unlock, jump sprite, slide, jitter, errors, perf)
dc127b87 fix: run bob was written to rig root y, clobbering the player jump height so the sprite never left the ground
bd4a4b44 fix: audio never unlocked (unlock() had no callers) and camera fully tracked player.y so jumps looked like camera moves; follow 25% with damping

### luna
252a04d6 fix: release game scene resources on dispose
337d4216 fix: remove Escape listener when game is disposed
f1c0f7b5 fix: validate stored leaderboard entries before rendering
fe02487f fix: classify voice and laugh clip volume controls
cec5bfc1 fix: perf log interval used FIXED_DT per rendered frame, drifting with fps (2.1s at 144fps); use real elapsed time
b3b8f24c docs: manual playtest checklist for next session
```

## 清理动作

```bash
git tag -d legacy-full-history      # 旧历史的 tag
git branch -D keep-current luna     # 两条污染分支
git reflog expire --expire=now --all
git gc --prune=now                  # 回收 .venv-ml 的旧对象
```

## 结果

- `.git` 从 2.5 GB 降到几 MB
- 远端（GitHub）本来就只有干净的单提交，不受影响
- 以后新增文件前先确认 `.gitignore` 覆盖了本地产物（`.venv-ml/`、`.tmp/`、`shots/`、`game/dist/`、`game/node_modules/`）
