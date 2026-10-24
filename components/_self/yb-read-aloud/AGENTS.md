<!-- Parent: ../AGENTS.md -->
# yb-read-aloud

聊天朗读的业务控制条。公开 play({conversationId,messageId}) / stop()；error事件交给宿主显示提示。

- 复用 yb-notice-capsule 的 floating-search 表面、100ms入场和退场，duration=0 不按计时器关闭；播放结束触发stop，100ms退场后隐藏。使用公共默认120rpx高度和60rpx圆角，与其他提醒保持一致。内容为已播放时长，prefix暂停/继续，suffix倍速、前后15秒、关闭。resumeOnReplace=true，其他提醒覆盖时继续合成或播放，保持音频实例、进度和倍速；提醒消失后由公共胶囊恢复控制条。覆盖期间结束、主动停止、切会话或离页时清除恢复资格，不再显示旧控制条。
- 请求统一走 request/speech.js，由请求层读取chatAbout.chatVoice的最新快照；当前播放不随设置变更而中断，下一次朗读采用新声音；可信正文与所有权校验在后端，客户端不发送模型密钥、正文或可下载URL。
- InnerAudioContext(useWebAudioImplement=false) 播放本地MP3；原生 pause/play/seek/playbackRate/onTimeUpdate，时间标签只在整秒变化时setData。倍速范围0.75–2，Android须6及以上；seek按0和duration夹取。播放结束自动关闭、销毁音频并清理本地MP3，迟到onEnded不能关闭新播放。
- 播放中切倍速先pause，在当前实例onPause回调设置最新playbackRate并play，从原位置自动继续；连续点击合并为一次暂停，使用最后选中的倍速。原本暂停时只设倍速、不自动播放；主动暂停可取消自动继续，关闭/换音频后迟到onPause不得恢复旧播放。
- 合成时默认内容保持00:00，不显示合成中文字；prefix替换为icon-loading_flow_iconfont，沿用现有loading的1.5秒线性循环旋转。旋转为自主WXSS keyframes，仅loading时附加；播放按钮不可操作但加载图标不降低透明度，合成状态仅保留在无障碍标签。胶囊自身进退场仍由公共组件Worklet负责。
- 切会话由宿主stop；离页/销毁停止、销毁音频、取消请求并删除临时MP3；版本核对防止迟到请求/文件写入/音频事件恢复播放。无持久音频缓存。
- 复用 skyfontline、skyother 的布局/字号类及 skycolor 文字颜色。局部只定义控制按钮尺寸、间距及时间排版。
- pause_circle_line/play_circle_line/fast_rewind_line/fast_forward_line 使用公共内嵌TTF的正式图标，不叠加备用字符或额外15秒文字。
- 渲染边界沿用首页Skyline/glass-easel，项目最低3.7.2；root-portal官方要求Nightly调试。原生音频上下文不依赖audio组件或WebView，播放速度最低2.11.0。真机倍速、跳转、系统中断及声音输出需独立验收。
