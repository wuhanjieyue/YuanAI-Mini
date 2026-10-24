<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-12 | Updated: 2026-04-12 -->

# pages/voiceChat

## Purpose
语音聊天壳页。当前主要提供语音交互的视觉容器与关闭按钮，业务逻辑仍较轻。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 页面生命周期与关闭动作 |
| `index.wxml` | 语音可视化区域与底部操作按钮 |
| `index.json` | 页面配置 |

## Working Notes
- 当前未接入实际音频流或录音逻辑
- 视觉上保留了语音波形/控制按钮区域，便于后续接入

## For AI Agents

### Working In This Directory
- 若扩展语音业务，优先保持页面壳结构，只补充状态与交互
- 当前关闭行为仅 `wx.navigateBack()`
