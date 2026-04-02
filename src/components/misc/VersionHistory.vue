<script lang="ts" setup>
import type { PropType } from 'vue'
import MarkdownIt from 'markdown-it'
import mdLinkAttributes from 'markdown-it-link-attributes'

// 初始化 markdown-it
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})

// 插件：链接在新窗口打开
md.use(mdLinkAttributes, {
  attrs: {
    target: '_blank',
    rel: 'noopener noreferrer',
  },
})

// 渲染 Markdown
function renderMarkdown(value: string) {
  if (!value) return ''
  return md.render(value)
}

// 输入参数
const props = defineProps({
  history: Object as PropType<{ [key: string]: string }>,
})
</script>

<template>
  <VCardText>
    <VList>
      <VListItem v-for="(value, key) in props.history" :key="key">
        <VListItemTitle class="font-bold text-lg">
          {{ key }}
        </VListItemTitle>
        <div class="markdown-body text-gray-500" v-html="renderMarkdown(value)" />
      </VListItem>
    </VList>
  </VCardText>
</template>

<style scoped>
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin-block: 0.5rem;
  font-weight: 600;
}

.markdown-body :deep(h1) {
  font-size: 1.5rem;
}

.markdown-body :deep(h2) {
  font-size: 1.25rem;
}

.markdown-body :deep(h3) {
  font-size: 1.1rem;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-inline-start: 1.5rem;
  margin-block: 0.5rem;
}

.markdown-body :deep(li) {
  margin-block: 0.25rem;
}

.markdown-body :deep(p) {
  margin-block: 0.5rem;
}

.markdown-body :deep(a) {
  color: rgb(99 102 241);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(code) {
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  font-size: 0.875em;
  background-color: rgba(127, 127, 127, 0.15);
}

.markdown-body :deep(pre) {
  padding: 0.75rem 1rem;
  margin-block: 0.5rem;
  overflow-x: auto;
  border-radius: 0.375rem;
  background-color: rgba(127, 127, 127, 0.15);
}

.markdown-body :deep(pre code) {
  padding: 0;
  background-color: transparent;
}

.markdown-body :deep(blockquote) {
  padding-inline-start: 1rem;
  margin-block: 0.5rem;
  border-inline-start: 3px solid rgba(127, 127, 127, 0.4);
  color: rgba(127, 127, 127, 0.8);
}
</style>
