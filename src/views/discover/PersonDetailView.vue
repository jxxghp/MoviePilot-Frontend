<script setup lang="ts">
import MediaCardListView from './MediaCardListView.vue'
import api from '@/api'
import personIcon from '@images/misc/person.png'
import type { Person } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from 'vue-i18n'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import MarkdownIt from 'markdown-it'
import mdLinkAttributes from 'markdown-it-link-attributes'

// 国际化
const { t } = useI18n()

// 输入参数
const personProps = defineProps({
  personid: String,
  type: String,
  source: String,
})

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// AniList 人物简介使用 Markdown；禁用原始 HTML，避免第三方内容注入标签或事件属性。
const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: true,
})
markdown.use(mdLinkAttributes, {
  attrs: {
    target: '_blank',
    rel: 'noopener noreferrer',
  },
})

// 媒体详情
const personDetail = ref<Person>({} as Person)

// 是否已加载完成
const isRefreshed = ref(false)

// 人物图片是否加载
const isImageLoaded = ref(false)

// 仅转换 AniList 的 Markdown 简介，其他数据源保持原有纯文本展示。
const personBiographyHtml = computed(() => {
  if (personProps.source !== 'anilist' || !personDetail.value.biography) return ''
  return markdown.render(personDetail.value.biography)
})

// 调用API查询详情
async function getPersonDetail() {
  if (personProps.personid) {
    if (personProps.source === 'themoviedb') {
      personDetail.value = await api.get(`tmdb/person/${personProps.personid}`)
    } else if (personProps.source === 'douban') {
      personDetail.value = await api.get(`douban/person/${personProps.personid}`)
    } else if (personProps.source === 'bangumi') {
      personDetail.value = await api.get(`bangumi/person/${personProps.personid}`)
    } else if (personProps.source === 'anilist') {
      personDetail.value = await api.get(`anilist/person/${personProps.personid}`)
    }
    isRefreshed.value = true
  }
}

// 人物图片地址
function getPersonImage() {
  let url = ''
  if (personProps.source === 'themoviedb') {
    if (!personDetail.value?.profile_path) return personIcon
    url = `https://${globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w600_and_h900_bestv2${personDetail.value?.profile_path}`
  } else if (personProps.source === 'douban') {
    if (!personDetail.value?.avatar) return personIcon
    if (typeof personDetail.value?.avatar === 'object') {
      url = personDetail.value?.avatar?.normal
    } else {
      url = personDetail.value?.avatar
    }
  } else if (personProps.source === 'bangumi') {
    if (!personDetail.value?.images) return personIcon
    url = personDetail.value?.images?.medium
  } else if (personProps.source === 'anilist') {
    if (!personDetail.value?.images) return personIcon
    url = personDetail.value?.images?.large || personDetail.value?.images?.medium
  } else {
    return personIcon
  }
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
}

// 将别名数组拆分为、分隔的字符串
function getAlsoKnownAs() {
  if (!personDetail.value?.also_known_as) return ''
  if (personProps.source === 'themoviedb') {
    return t('person.alias') + personDetail.value.also_known_as.join('、')
  } else {
    return personDetail.value.also_known_as.join('，')
  }
}

// 参演作品路由地址
function getPersonCreditsPath() {
  let apipath = 'tmdb'
  if (personProps.source === 'douban') {
    apipath = 'douban'
  } else if (personProps.source === 'bangumi') {
    apipath = 'bangumi'
  } else if (personProps.source === 'anilist') {
    apipath = 'anilist'
  }
  return `/browse/${apipath}/person/credits/${personDetail.value.id}?title=${t('person.credits')}`
}

// 参演作品API路径
function getPersonCreditsApiPath() {
  let apipath = 'tmdb'
  if (personProps.source === 'douban') {
    apipath = 'douban'
  } else if (personProps.source === 'bangumi') {
    apipath = 'bangumi'
  } else if (personProps.source === 'anilist') {
    apipath = 'anilist'
  }
  return `${apipath}/person/credits/${personDetail.value.id}`
}

onBeforeMount(() => {
  getPersonDetail()
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <div v-if="personDetail.id" class="max-w-8xl mx-auto px-4">
    <div class="relative z-10 mt-4 mb-8 flex flex-col items-center flex-md-row">
      <VAvatar
        size="200"
        :class="{
          'ring-1 ring-gray-700': isImageLoaded,
        }"
      >
        <VImg :src="getPersonImage()" cover @load="isImageLoaded = true" />
      </VAvatar>
      <div class="ms-3">
        <h1 class="text-3xl lg:text-4xl text-center text-lg-left">
          {{ personDetail.name }}
        </h1>
        <div class="mt-1 mb-2 space-y-1 text-xs sm:text-sm lg:text-base text-center text-lg-left">
          <div>
            <span v-if="personDetail.birthday">{{ personDetail.birthday }}</span>
            <span v-if="personDetail.place_of_birth"> | </span>
            <span v-if="personDetail.place_of_birth">{{ personDetail.place_of_birth }}</span>
          </div>
          <div v-if="personDetail.also_known_as">{{ getAlsoKnownAs() }}</div>
        </div>
      </div>
    </div>
    <div class="relative text-left">
      <div class="group outline-none ring-0" role="button" tabindex="-1">
        <div
          v-if="personProps.source === 'anilist'"
          class="person-biography pt-2 text-sm lg:text-base"
          v-html="personBiographyHtml"
        />
        <p v-else class="pt-2 text-sm lg:text-base" style="overflow-wrap: break-word">
          {{ personDetail.biography }}
        </p>
      </div>
    </div>
    <div class="person-credits-section">
      <div class="slider-header">
        <RouterLink :to="getPersonCreditsPath()" class="slider-title">
          <span>{{ t('person.credits') }}</span>
          <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
        </RouterLink>
      </div>
      <MediaCardListView :apipath="getPersonCreditsApiPath()" />
    </div>
  </div>
  <NoDataFound
    v-if="!personDetail.id && isRefreshed"
    error-code="500"
    :error-title="t('error.title')"
    :error-description="t('error.networkError')"
  />
</template>

<style scoped>
.person-biography {
  overflow-wrap: break-word;
}

.person-biography :deep(p),
.person-biography :deep(ul),
.person-biography :deep(ol),
.person-biography :deep(blockquote) {
  margin-block: 0 0.75rem;
}

.person-biography :deep(ul),
.person-biography :deep(ol) {
  padding-inline-start: 1.5rem;
}

.person-biography :deep(a) {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}

.person-biography :deep(a:hover) {
  text-decoration: underline;
}

.person-biography :deep(blockquote) {
  border-inline-start: 3px solid rgba(var(--v-theme-on-surface), 0.25);
  color: rgba(var(--v-theme-on-surface), 0.7);
  padding-inline-start: 0.75rem;
}

.person-biography :deep(:last-child) {
  margin-block-end: 0;
}

.person-credits-section {
  margin-block-start: 2rem;
}
</style>
