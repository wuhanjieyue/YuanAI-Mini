function rpx2px(rpx, screenWidth) {
  return Math.floor((screenWidth / 750) * Number(rpx))
}

module.exports = { rpx2px }
