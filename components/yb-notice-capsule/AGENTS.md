<!-- Parent: ../AGENTS.md -->
# yb-notice-capsule

独立的 Skyline 提醒胶囊，只消费显式属性与 slot，不依赖业务状态、请求或 App 全局数据。

- 方法 `show(message = text)` 显示提醒，`hide()` 播放100ms反向退场后隐藏。duration 为入场动画完成后的停留时间，默认2000ms，0表示不自动隐藏；入场完成后通过runOnJS开始计时，回调和计时器核对版本及detached。
- 普通内容直接使用 text 或 show(message)。设置 customContent=true 后，默认 slot 完整替换文字区；prefix/suffix 两个具名 slot 自定义前后缀 icon、按钮或其他内容，不注入内置图标和点击行为。自定义内容仍可在 show(message) 传同义文本作为无障碍标签。
- alert=true 使用无障碍 alert，默认使用status；themeStyle 显式透传外观变量。suffix 内的关闭按钮由调用方绑定 hide()。
- 复用 floating-search 表面和32rpx内边距；heightRpx统一默认120，圆角为高度一半（默认60rpx）；朗读、上传、删除文件和资源结果提醒均使用公共默认高度。高度经shared同步参与动画起始中心点计算，属性更新后仍对齐微信胶囊中心。宽86vw、水平居中，终点在微信胶囊底部下36rpx。局部保留 portal定位、高度/圆角覆盖、16rpx内容间距、显隐及中心基准50% 50%。
- 读取 wx.getWindowInfo / getMenuButtonBoundingClientRect，root-portal 逃逸半屏裁剪，show时测量notice-origin修正top/left，ready后对常驻节点绑定applyAnimatedStyle。
- 首次显示以shared进度在100ms内同步驱动translateY、scale（0.6→1）、opacity（0.3→1）；普通退场100ms反向回到起始位置、scale 0.6和opacity 0.3，timing完成后通过runOnJS隐藏。没有WXSS keyframes或逐帧setData。
- 模块内协调所有实例，最新show请求优先；新实例完成定位和setData后，同步启动旧实例100ms透明度淡出和新实例100ms淡入，新实例固定在最终位置，旧实例冻结当前位移/缩放。独立shared透明度不影响普通进退场；同实例更新不重置动画起点，只更新内容并刷新停留时间。
- 被替换的实例立即禁用点击及无障碍访问，并发出replaced事件。resumeOnReplace默认false；朗读控制条显式设为true，保留一个待恢复实例，普通提醒消失时淡回该实例，不重建slot内容或重启其业务。连续提醒只恢复最新仍有效的常驻胶囊，不建立提醒队列。
- 常驻胶囊主动hide（包括播放结束、停止和离页）或detached立即清除自己的恢复资格，即使仍在淡出或已隐藏；迟到恢复请求仍受版本和最新show请求保护。普通提醒在恢复期间再次show须反向淡回，不能留在透明状态。
- 重复show取消旧计时器；测量、setData及动画完成回调核对版本、最新请求和detached，hide/离页/销毁作废迟到回调并清理计时器。重复hide不重启普通退场，新show不被旧退场完成回调隐藏；detached及最终隐藏只清理自己持有的当前实例引用。默认仅在ready后调用公开方法。

```xml
<yb-notice-capsule id="notice" text="保存成功" theme-style="{{themeStyle}}">
  <text slot="prefix" class="iconfont icon-image1"></text>
  <view slot="suffix" bind:tap="closeNotice">关闭</view>
</yb-notice-capsule>
```

在调用方JSON的usingComponents中登记 `/components/yb-notice-capsule/index`。通过 `selectComponent('#notice').show()` 显示，关闭方法调用同一实例的hide()。
