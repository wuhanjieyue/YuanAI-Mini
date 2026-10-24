<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-07-12 -->

# components/_self/yb-chat-input

## Purpose
聊天输入组件。统一处理文本输入、多行高度变化、录音授权、录音波形、发送/停止按钮状态切换。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 组件逻辑、录音管理、输入观察与事件派发 |
| `index.wxml` | textarea、语音波形、发送按钮与清空按钮 |
| `index.json` | 小程序组件声明 |

## Properties
- `inputFocus: Boolean`
- `settings: Object`
- `hapticFeedback: Boolean`
- `accessoryInsetRpx: Number`：为右侧表盘或模型摘要预留输入区域
- `disabled: Boolean`：禁用原生输入、清空、发送和录音；已有响应的 Stop 保留可用。
- `disabledPlaceholder: String`：禁用时覆盖占位文案并隐藏草稿展示；草稿仍保存在 askText，恢复后显示。留空时保留历史恢复/校验期间的草稿展示。

## Events
- `startChat`
- `endStream`
- `getAskText`：保留 trim 后的 `askText`，`hasValue` 表示原始文本非空（含空白）。
- `focusChange`：原生 focus/blur 回传 `{ focused }`。
- `changeLeftIcon`
- `sendTranscription`：右侧发送的识别结果，携带voiceVersion，由宿主复用startChat；acceptSend或finishVoiceSend按版本结束等待。
- `voiceError`：识别/录音失败，由宿主复用顶部提醒胶囊。
- `openPlugins`：输入恰好变为 `@` 时触发，保留输入；聊天视图通过 `fromMention` 标识复用半屏工具页，仅选中工具后清除仍为 `@` 的输入，关闭不清除。

## Core Behaviors

### Input Mode
- `askText` 变化时自动向父级派发 `getAskText`
- `setAreaHeight()` 根据文本长度调整所属 `yb-chat-view` 的 `inputHeight`
- `setSmartMode()` 复用多行输入布局，让输入框为模型摘要预留底部区域
- `clearText()` / `setCopytext()` 负责编辑回填
- `startChat` 只派发发送意图；父级写入本地消息后调用 `acceptSend()` 清空草稿。会话存在处理中的轮次时，无论草稿是否有内容，按钮均显示停止。

### Voice Mode
- `wx.getRecorderManager()`是全局单例，本模块只注册一组监听，并按recorderOwner派发；卸载仅在确实录音时stop，不能在初始化/普通卸载触发录音权限。
- `onFrameRecorded` 按音量刷新 `bars`
- 开始录音时强制恢复底部单行布局并隐藏原生 `textarea`；节点保持挂载，确保 `applyAnimatedStyle` 持续生效
- `reduction(text, focus)` 恢复输入布局；识别成功追加到现有草稿；发送按钮左边的方块结束录音只回填，发送箭头/上滑松手结束后交给宿主直接发送。
- 沿用点击/长按/滑动交互；左侧icon-x取消语音；发送按钮左边的方块结束录音并识别回填，右侧箭头（或上滑后松手）结束录音后识别并直接发送。最长60秒自动结束时仅回填。
- 麦克风未授权时会弹窗引导到系统设置

### Owner Coupling
该组件依赖所属 `components/_self/yb-chat-view` 上的 shared 值：
- `inputHeight`
- `keyHeight`
- `chatHeight`
- 其他输入区动画状态

通用 rpx 换算与触觉调用复用 `static_utils/otherUtils.js`、`static_utils/haptic.js`，`.iconfont` 基类显式导入 `static_wxss/skyfontline.wxss`；Worklet `clamp`、录音逻辑、图标码点和布局样式仍留在本目录。

## Risks / Hotspots
- 录音流程依赖较多手势状态，修改时容易影响长按/取消发送逻辑
- `index.wxml` 类名与 `applyAnimatedStyle` 强绑定
- 波形条数据高频刷新，避免引入重计算

## For AI Agents

### Working In This Directory
- 若改输入高度策略，要同步考虑首页底部 padding
- 若改录音格式或参数，要检查后续转录链路是否兼容
- 不要越过 `yb-chat-view` 直接依赖 `pages/index`；输入 shared 逻辑继续由聊天视图统一提供

- Stop 只派发 `endStream`；聊天视图同步调用 finish 恢复发送/语音按钮，并继续请求云端取消。

- PCM录音固定16000Hz/单声道/16位，保留onFrameRecorded波形；实际设备采样率与桌面录音限制需独立验证。请求经request/transcription.js上传原始二进制，不在组件拼HTTP/供应商参数。
- 替换草稿、禁用、切聊天、离页与销毁均cancelVoice：取消请求、恢复原草稿并推进版本，迟到文件/响应不能恢复旧识别。取消得到的临时文件及识别完成后的临时文件均清理。系统中断丢弃录音并提示；失败保留草稿。

- voiceLoading期间右侧复用input-action-disabled及--bg-l2/--text-l2置灰，tap/longpress均拦截；发送按钮左边的方块显示icon-loading_flow_iconfont的1.5秒自主循环旋转；状态及旋转样式由输入组件本地管理。
- 直接发送等待从识别延续到消息接收；acceptSend恢复常规askStatus，发送被拦截时finishVoiceSend保留草稿。完成回执核对voiceVersion，不能解除新一轮识别；直接发送保持键盘关闭。

- 录音或识别期间，宿主左侧显示黑色icon-x，直接复用cancelVoice中断并保留草稿；发送按钮左侧为64rpx停止/加载命中区，波形尾部预留158rpx。复用iconfont/ft32/ac/jc/cradius/bg-l2/text-l0，局部样式只管理位置、命中区和旋转；关闭图标的ft40及--palette-light-text保留在宿主样式。

- 识别等待隐藏录音波形，在原wave-area可用区域通过jc居中显示i18n.chat.transcription（中文“正在识别”）；录音时继续显示波形，仅停止按钮显示旋转loading。文字复用ft28/text-l1/ac/jc，局部dictation-label只防止收缩与换行，不新增动画。左侧关闭始终可取消，右侧发送继续禁用。
