function prepareSearchClose(view) {
  const keyboardHeight = Math.max(0, view._keyboardOffset.value - 12)
  view._searchCloseProgress.value = view._searchActionProgress.value
  view._searchCloseKeyboardHeight.value = keyboardHeight
  if (keyboardHeight > 0) {
    view._keyboardOffset.value = keyboardHeight + 12
    view._searchActionProgress.value = view._searchCloseProgress.value
    view._searchActionActive = false
  } else {
    view.animateSearchAction(false)
    view.animateKeyboardOffset(0)
  }
}

module.exports = { prepareSearchClose }
