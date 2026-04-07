<script lang="ts" setup>
import MarkdownIt from 'markdown-it'
import mdLinkAttributes from 'markdown-it-link-attributes'
import { isNullOrEmptyObject } from '@/@core/utils'
import type { Message } from '@/api/types'
import { formatDateDifference } from '@core/utils/formatters'

// 输入参数
const props = defineProps({
  message: Object as PropType<Message>,
  width: String,
  height: String,
})

// 定义事件
const emit = defineEmits(['imageload'])

// 图片是否加载完成
const isImageLoaded = ref(false)

// 图片是否加载失败
const imageLoadError = ref(false)

// 初始化 markdown-it
const md = new MarkdownIt({
  html: true,
  breaks: true,
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

// 图片加载完成
async function imageLoaded() {
  isImageLoaded.value = true
  emit('imageload')
}

// 链接打开新窗口
function openLink() {
  if (props.message?.link) window.open(props.message.link, '_blank')
}

// 将note转换为json
function noteToJson() {
  if (props.message?.note) {
    try {
      return JSON.parse(props.message.note)
    } catch (error) {
      return props.message.note
    }
  }
  return {}
}

// 渲染 Markdown
function renderMarkdown(value: string) {
  if (!value) return ''
  return md.render(value)
}
</script>

<template>
  <VCard variant="tonal" :width="props.width" :height="props.height" @click="openLink" max-width="23rem">
    <div v-if="props.message?.image" class="relative text-center card-cover-blurred">
      <VImg
        :src="props.message?.image"
        aspect-ratio="3/2"
        cover
        position="top"
        @load="imageLoaded"
        @error="imageLoadError = true"
        min-height="10rem"
      >
        <template #placeholder>
          <div class="w-full h-full">
            <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
          </div>
        </template>
      </VImg>
    </div>
    <div
      v-if="
        props.message?.title &&
        !props.message?.text &&
        !props.message?.image &&
        isNullOrEmptyObject(props.message?.note) &&
        props.message?.action === 0
      "
      class="rounded-md text-body-1 py-2 px-4 elevation-2 bg-primary text-white chat-right mb-1"
    >
      <p class="mb-0">{{ props.message?.title }}</p>
    </div>
    <VCardTitle v-else-if="props.message?.title" class="break-words whitespace-break-spaces">
      {{ props.message?.title }}
    </VCardTitle>
    <div
      v-if="props.message?.text && props.message?.action === 0"
      class="rounded-md text-body-1 py-1 px-4 elevation-2 bg-primary text-white chat-right"
    >
      <div class="markdown-body" v-html="renderMarkdown(props.message?.text)" />
    </div>
    <VCardText
      v-if="props.message?.text && props.message?.action === 1"
      class="markdown-body"
      v-html="renderMarkdown(props.message?.text)"
    />
    <VCardText v-if="!isNullOrEmptyObject(props.message?.note)">
      <VList>
        <VListItem v-for="(value, key) in noteToJson()" :key="key" two-line>
          <VListItemTitle v-if="value.title_year" class="font-bold break-words whitespace-break-spaces">
            {{ Number(key) + 1 }}. {{ value.title_year }}
          </VListItemTitle>
          <VListItemTitle v-if="value.enclosure" class="font-bold break-words whitespace-break-spaces">
            {{ Number(key) + 1 }}. {{ value.title }} {{ value.volume_factor }} ↑{{ value.seeders }}
          </VListItemTitle>
          <VListItemSubtitle v-if="value.type">
            类型：{{ value.type }} 评分：{{ value.vote_average }}
          </VListItemSubtitle>
          <VListItemSubtitle v-if="value.enclosure" class="whitespace-break-spaces">
            {{ value.description }}
          </VListItemSubtitle>
        </VListItem>
      </VList>
    </VCardText>
  </VCard>
  <div class="text-end">
    <span v-if="props.message?.action === 0" class="text-sm italic me-2">{{ props.message?.userid }}</span>
    <span class="text-sm italic me-2">{{
      formatDateDifference(props.message?.reg_time || props.message?.date || '')
    }}</span>
  </div>
</template>

<style lang="scss">
.markdown-body {
  word-break: break-all;

  p {
    margin-block-end: 0.5rem;
  }

  p:last-child {
    margin-block-end: 0;
  }

  a {
    color: inherit;
    text-decoration: underline;
  }

  ul {
    list-style-type: disc;
    margin-block-end: 0.5rem;
    padding-inline-start: 1.5rem;
  }

  ol {
    list-style-type: decimal;
    margin-block-end: 0.5rem;
    padding-inline-start: 1.5rem;
  }

  li {
    display: list-item;
    margin-block-end: 0.25rem;
  }

  code {
    border-radius: 4px;
    background-color: rgba(var(--v-border-color), 0.1);
    font-family: monospace;
    padding-block: 0.2rem;
    padding-inline: 0.4rem;
  }

  pre {
    overflow: auto;
    padding: 1rem;
    border-radius: 8px;
    background-color: rgba(var(--v-border-color), 0.1);
    margin-block-end: 0.5rem;

    code {
      padding: 0;
      background-color: transparent;
    }
  }

  blockquote {
    border-inline-start: 4px solid rgba(var(--v-border-color), 0.2);
    font-style: italic;
    margin-block-end: 0.5rem;
    padding-inline-start: 1rem;
  }

  table {
    border-collapse: collapse;
    inline-size: 100%;
    margin-block-end: 1rem;

    th,
    td {
      padding: 0.5rem;
      border: 1px solid rgba(var(--v-border-color), 0.1);
      text-align: start;
    }

    th {
      background-color: rgba(var(--v-border-color), 0.05);
    }
  }

  img {
    block-size: auto;
    max-inline-size: 100%;
  }
}
</style>
