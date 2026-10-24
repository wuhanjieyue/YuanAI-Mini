function observeTurn(key, listener) {
  return wx.yuanAI.chatRuntime.observe(key, listener)
}
module.exports = { observeTurn }
