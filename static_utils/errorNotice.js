let sequence = 0

function showNotice({ title }) {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  if (page) page.setData({ errorNotice: { text: title || '请求失败', id: ++sequence } })
}

module.exports = { showNotice, showErrorNotice: showNotice }
