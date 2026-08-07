<script setup lang="ts">
import { renderAgentMarkdown } from '@/utils/agentMarkdown'

const props = withDefaults(
  defineProps<{
    content: string
    streaming?: boolean
    variant?: 'choice' | 'message'
  }>(),
  {
    streaming: false,
    variant: 'message',
  },
)

const STREAM_MARKDOWN_RENDER_INTERVAL = 96

const renderedHtml = shallowRef('')
let renderTimer: number | null = null
let lastRenderedAt = 0
let hasRendered = false

function clearRenderTimer() {
  if (renderTimer === null) return

  window.clearTimeout(renderTimer)
  renderTimer = null
}

// 流式阶段限制 Markdown 全量解析频率；结束时立即渲染最终内容。
function renderContent(immediate = false) {
  const now = performance.now()
  const elapsed = now - lastRenderedAt
  if (immediate || !hasRendered || elapsed >= STREAM_MARKDOWN_RENDER_INTERVAL) {
    clearRenderTimer()
    renderedHtml.value = renderAgentMarkdown(props.content)
    lastRenderedAt = now
    hasRendered = true
    return
  }

  if (renderTimer !== null) return
  renderTimer = window.setTimeout(() => {
    renderTimer = null
    renderedHtml.value = renderAgentMarkdown(props.content)
    lastRenderedAt = performance.now()
    hasRendered = true
  }, STREAM_MARKDOWN_RENDER_INTERVAL - elapsed)
}

watch(
  () => props.content,
  () => renderContent(!props.streaming),
  { immediate: true },
)

watch(
  () => props.streaming,
  streaming => {
    if (!streaming) renderContent(true)
  },
)

onScopeDispose(clearRenderTimer)
</script>

<template>
  <div
    v-if="renderedHtml"
    class="markdown-body"
    :class="variant === 'choice' ? 'agent-assistant-choice__prompt' : 'agent-assistant-message__bubble'"
    v-html="renderedHtml"
  />
</template>
