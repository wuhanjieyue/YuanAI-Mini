/**
 * 将rpx转换为px
 * @param {*} rpx
 * @param {*} windowWidth
 * @returns {number} px
 */
export function rpx2px(rpx, windowWidth) {
  let px = (windowWidth / 750) * Number(rpx);
  return Math.floor(px);
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}
