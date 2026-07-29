import type { Ace } from 'ace-builds'

const ACE_EDITOR_PADDING = 12
const ACE_EDITOR_SCROLL_MARGIN = { bottom: 8, left: 0, right: 0, top: 8 }

/** 让所有 Ace 编辑器的文本内容与普通输入框保持一致的内边距和滚动留白。 */
export function configureAceEditorPadding(editor: Ace.Editor) {
  editor.renderer.setPadding(ACE_EDITOR_PADDING)
  editor.renderer.setScrollMargin(
    ACE_EDITOR_SCROLL_MARGIN.top,
    ACE_EDITOR_SCROLL_MARGIN.bottom,
    ACE_EDITOR_SCROLL_MARGIN.left,
    ACE_EDITOR_SCROLL_MARGIN.right,
  )
}
