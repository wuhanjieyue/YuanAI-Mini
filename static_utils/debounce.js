/**
 * 防抖函数
 * @param {*} func 
 * @param {*} wait 
 * 多次相同事件，最后结束，停止相同事件后执行
 */
function debounce(func, wait = 350){
  let timer = null
  function debounced(...args) {
    const context = this 
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      func.call(context, ...args)
    }, wait)
  }

  debounced.cancel = function() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  return debounced
}
export default debounce
