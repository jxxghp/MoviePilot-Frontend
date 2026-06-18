<script lang="ts" setup>
import type { PropType } from 'vue'
import MarkdownIt from 'markdown-it'
import mdLinkAttributes from 'markdown-it-link-attributes'

// 版本历史可能来自插件市场或 Release 内容，禁止透传原始 HTML，避免外部内容注入脚本或事件属性。
const md = new MarkdownIt({
  html: false,
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
  hasAction: Function as PropType<(version: string) => boolean>,
})

function shouldRenderAction(version: string) {
  return props.hasAction?.(version) ?? true
}
</script>

<template>
  <VCardText class="version-history">
    <div class="version-history__list">
      <section v-for="(value, key) in props.history" :key="key" class="version-history__item">
        <div
          class="version-history__top"
          :class="{ 'version-history__top--with-action': $slots.action && shouldRenderAction(String(key)) }"
        >
          <div class="version-history__header">
            <div class="version-history__version">
              {{ key }}
            </div>
            <div v-if="$slots.meta" class="version-history__meta">
              <slot name="meta" :version="String(key)" />
            </div>
          </div>
          <div v-if="$slots.action && shouldRenderAction(String(key))" class="version-history__action">
            <slot name="action" :version="String(key)" />
          </div>
        </div>
        <div class="markdown-body text-medium-emphasis" v-html="renderMarkdown(value)" />
      </section>
    </div>
  </VCardText>
</template>

<style scoped>
.version-history {
  padding: 0;
}

.version-history__list {
  display: flex;
  flex-direction: column;
}

.version-history__item {
  padding: 1.25rem 2rem;
}

.version-history__item + .version-history__item {
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.version-history__top {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "main";
  gap: 0;
  align-items: center;
  margin-block-end: 0.5rem;
}

.version-history__top--with-action {
  grid-template-columns: minmax(0, 1fr) max-content;
  grid-template-areas: "main action";
  gap: 1rem;
}

.version-history__header {
  grid-area: main;
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
}

.version-history__version {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.25;
}

.version-history__meta {
  display: flex;
  min-width: 0;
}

.version-history__action {
  grid-area: action;
  align-self: center;
  justify-self: end;
}

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

@media (max-width: 600px) {
  .version-history {
    padding: 0;
  }

  .version-history__item {
    padding: 1rem;
  }

  .version-history__top--with-action {
    gap: 0.75rem;
  }

  .version-history__header {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .version-history__version {
    font-size: 1.125rem;
  }

}
</style>
