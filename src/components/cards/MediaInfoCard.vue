<script lang="ts" setup>
import type { PropType } from 'vue'
import type { Context } from '@/api/types'
import { isNullOrEmptyObject } from '@/@core/utils'

// 输入参数
const props = defineProps({
  context: Object as PropType<Context>,
})

// 音乐元数据使用 title，影视元数据使用 name，识别结果卡片统一兼容两种字段。
const recognizedName = computed(() => props.context?.meta_info?.name || props.context?.meta_info?.title)

// 是否为音乐识别结果
const isMusic = computed(
  () => props.context?.media_info?.type === '音乐' || props.context?.meta_info?.type === '音乐',
)

// TMDB图片转换为w500大小
function getW500Image(url = '') {
  if (!url) return ''
  return url.replace('original', 'w500')
}

// 打开TMDB详情页面
function openTmdbPage(type: string, tmdbId: number) {
  if (!type || !tmdbId) return

  const url = `https://www.themoviedb.org/${type === '电影' ? 'movie' : 'tv'}/${tmdbId}`
  window.open(url, '_blank')
}

// 秒数格式化为 m:ss 时长文本
function formatDuration(seconds: number | undefined) {
  if (!seconds || seconds <= 0) return ''
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

// 音乐封面优先使用方形封面，仅 W500 图片处理对TMDB类 URL 生效
const musicCover = computed(() => getW500Image(
  props.context?.media_info?.cover_url || props.context?.media_info?.poster_path || '',
))

// 音乐详情外链
const musicLink = computed(() => props.context?.media_info?.detail_link || '')

// 打开音乐详情外链
function openMusicDetail() {
  if (musicLink.value) window.open(musicLink.value, '_blank')
}
</script>

<template>
  <div v-show="context">
    <VCol>
      <div
        v-if="recognizedName"
        class="d-flex justify-space-between flex-wrap flex-md-nowrap flex-column flex-md-row"
      >
        <div v-if="isMusic && musicCover" class="ma-auto">
          <VImg
            width="10rem"
            aspect-ratio="1"
            class="object-cover rounded-lg ring-1 ring-gray-500"
            :src="musicCover"
            cover
          >
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover" />
              </div>
            </template>
          </VImg>
        </div>
        <div v-else-if="context?.media_info?.poster_path" class="ma-auto">
          <VImg
            width="10rem"
            aspect-ratio="2/3"
            class="object-cover aspect-w-2 aspect-h-3 rounded-lg ring-1 ring-gray-500"
            :src="getW500Image(context?.media_info?.poster_path)"
            cover
          >
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
              </div>
            </template>
          </VImg>
        </div>
        <div class="flex-grow">
          <VCardItem class="pb-1">
            <div class="text-center text-md-left text-h6 font-weight-bold line-clamp-2 overflow-hidden text-ellipsis">
              {{ context?.media_info?.title || recognizedName }}
              <span v-if="context?.meta_info?.season_episode" class="text-sm text-medium-emphasis align-top">
                {{ context?.meta_info?.season_episode }}
              </span>
            </div>
            <VCardSubtitle class="text-center text-md-left">
              {{ context?.media_info?.year || context?.meta_info?.year }}
            </VCardSubtitle>
          </VCardItem>

          <VCardText
            v-if="context?.media_info?.overview"
            class="line-clamp-4 overflow-hidden text-ellipsis text-center text-md-left ..."
          >
            {{ context?.media_info?.overview }}
          </VCardText>

          <VCardItem class="text-center text-md-left">
            <!-- 类型 -->
            <VChip
              v-if="context?.media_info?.type || context?.meta_info?.type"
              variant="elevated"
              class="me-1 mb-1 text-white bg-blue-500"
            >
              {{ context?.media_info?.type || context?.meta_info?.type }}
            </VChip>
            <!-- 音乐实体类型 -->
            <VChip
              v-if="isMusic && context?.media_info?.music_type"
              variant="elevated"
              class="me-1 mb-1 text-white bg-blue-500"
            >
              {{ context?.media_info?.music_type }}
            </VChip>
            <!-- 艺术家 -->
            <VChip
              v-if="isMusic && context?.media_info?.artist"
              variant="elevated"
              class="me-1 mb-1 text-white bg-purple-500"
            >
              {{ context?.media_info?.artist }}
            </VChip>
            <!-- 专辑 -->
            <VChip
              v-if="isMusic && context?.media_info?.album"
              variant="elevated"
              class="me-1 mb-1 text-white bg-purple-500"
            >
              {{ context?.media_info?.album }}
            </VChip>
            <!-- 专辑艺术家 -->
            <VChip
              v-if="isMusic && context?.media_info?.album_artist"
              variant="elevated"
              class="me-1 mb-1 text-white bg-purple-500"
            >
              {{ context?.media_info?.album_artist }}
            </VChip>
            <!-- 发行日期 -->
            <VChip
              v-if="isMusic && context?.media_info?.release_date"
              variant="elevated"
              class="me-1 mb-1 text-white bg-purple-500"
            >
              {{ context?.media_info?.release_date }}
            </VChip>
            <!-- 风格 -->
            <VChip
              v-for="genre in isMusic ? context?.media_info?.genres : []"
              :key="genre"
              variant="elevated"
              class="me-1 mb-1 text-white bg-purple-500"
            >
              {{ genre }}
            </VChip>
            <!-- 音频技术参数 -->
            <VChip
              v-if="isMusic && context?.meta_info?.audio_format"
              variant="elevated"
              class="me-1 mb-1 text-white bg-orange-500"
            >
              {{ context?.meta_info?.audio_format }}
            </VChip>
            <VChip
              v-if="isMusic && (context?.meta_info?.bit_depth || context?.meta_info?.sample_rate)"
              variant="elevated"
              class="me-1 mb-1 text-white bg-orange-500"
            >
              {{ [context?.meta_info?.bit_depth, context?.meta_info?.sample_rate].filter(Boolean).join(' kHz ') }}
            </VChip>
            <!-- 时长 -->
            <VChip
              v-if="isMusic && formatDuration(context?.media_info?.duration)"
              variant="elevated"
              class="me-1 mb-1 text-white bg-orange-500"
            >
              {{ formatDuration(context?.media_info?.duration) }}
            </VChip>
            <!-- 曲目信息 -->
            <VChip
              v-if="isMusic && context?.media_info?.track_number"
              variant="elevated"
              class="me-1 mb-1 text-white bg-red-500"
            >
              {{ `曲目 ${context?.media_info?.track_number}${context?.media_info?.total_tracks ? ` / ${context?.media_info?.total_tracks}` : ''}` }}
            </VChip>
            <!-- ISRC -->
            <VChip
              v-if="isMusic && context?.media_info?.isrc"
              variant="elevated"
              class="me-1 mb-1 text-white bg-red-500"
            >
              {{ context?.media_info?.isrc }}
            </VChip>
            <!-- MusicBrainz 外链 -->
            <VChip
              v-if="isMusic && musicLink"
              variant="elevated"
              class="me-1 mb-1 text-white bg-green-500"
              @click="openMusicDetail"
            >
              详情
            </VChip>
            <!-- 二级分类 -->
            <VChip v-if="!isMusic && context?.media_info?.category" variant="elevated" class="me-1 mb-1 text-white bg-blue-500">
              {{ context?.media_info?.category }}
            </VChip>
            <!-- TMDBID -->
            <VChip
              v-if="!isMusic && context?.media_info?.tmdb_id"
              variant="elevated"
              class="me-1 mb-1 text-white bg-green-500"
              @click="openTmdbPage(context?.media_info?.type || '', context?.media_info?.tmdb_id)"
            >
              {{ context?.media_info?.tmdb_id }}
            </VChip>
            <!-- meta_info（音乐不显示影视资源信息） -->
            <template v-if="!isMusic">
              <VChip v-if="context?.meta_info?.web_source" variant="elevated" class="me-1 mb-1 text-white bg-purple-500">
                {{ context?.meta_info?.web_source }}
              </VChip>
              <VChip v-if="context?.meta_info?.edition" variant="elevated" class="me-1 mb-1 text-white bg-red-500">
                {{ context?.meta_info?.edition }}
              </VChip>
              <VChip v-if="context?.meta_info?.resource_pix" variant="elevated" class="me-1 mb-1 text-white bg-red-500">
                {{ context?.meta_info?.resource_pix }}
              </VChip>
              <VChip
                v-if="context?.meta_info?.video_encode"
                variant="elevated"
                class="me-1 mb-1 text-white bg-orange-500"
              >
                {{ context?.meta_info?.video_encode }}
              </VChip>
              <VChip
                v-if="context?.meta_info?.audio_encode"
                variant="elevated"
                class="me-1 mb-1 text-white bg-orange-500"
              >
                {{ context?.meta_info?.audio_encode }}
              </VChip>
              <VChip v-if="context?.meta_info?.resource_team" variant="elevated" class="me-1 mb-1 text-white bg-cyan-500">
                {{ context?.meta_info?.resource_team }}
              </VChip>
            </template>
          </VCardItem>
        </div>
      </div>
      <VAlert v-if="!recognizedName" icon="mdi-alert-circle-outline"> 识别失败，无法识别到有效信息！ </VAlert>
    </VCol>
    <VExpansionPanels v-show="!isNullOrEmptyObject(context?.meta_info.apply_words)">
      <VExpansionPanel>
        <VExpansionPanelTitle> 识别词应用详情 </VExpansionPanelTitle>
        <VExpansionPanelText>
          <VChip variant="elevated" class="me-1 mb-1 break-all" color="primary">
            {{ context?.meta_info.org_string }}
          </VChip>
          <VChip
            v-for="(val, key) in context?.meta_info.apply_words"
            :key="key"
            :val="val"
            variant="outlined"
            color="info"
            class="me-1 mb-1 break-all"
          >
            {{ val }}
          </VChip>
        </VExpansionPanelText>
      </VExpansionPanel>
    </VExpansionPanels>
  </div>
</template>