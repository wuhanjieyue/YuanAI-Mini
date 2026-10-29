function prepareSearchClose(view, independentAction = false) {
  if (independentAction) view.animateSearchAction(false)
  const keyboardHeight = Math.max(0, view._keyboardOffset.value - 12)
  view._searchCloseProgress.value = view._searchActionProgress.value
  view._searchCloseKeyboardHeight.value = keyboardHeight
  if (keyboardHeight > 0) {
    view._keyboardOffset.value = keyboardHeight + 12
    if (!independentAction) {
      view._searchActionProgress.value = view._searchCloseProgress.value
      view._searchActionActive = false
    }
  } else {
    if (!independentAction) view.animateSearchAction(false)
    view.animateKeyboardOffset(0)
  }
}

module.exports = { prepareSearchClose }
