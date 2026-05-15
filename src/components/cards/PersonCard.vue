<script lang="ts" setup>
import personIcon from '@images/misc/person-icon.png'
import type { Person } from '@/api/types'
import router from '@/router'
import { useGlobalSettingsStore } from '@/stores'

const personProps = defineProps({
  person: Object as PropType<Person>,
  width: String,
  height: String,
})

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 当前人物
const personInfo = ref(personProps.person)

// 人物图片是否加载
const isImageLoaded = ref(false)

// 人物图片地址
function getPersonImage() {
  let url = ''
  if (personProps.person?.source === 'themoviedb') {
    if (!personInfo.value?.profile_path) return personIcon
    url = `https://${globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w600_and_h900_bestv2${personInfo.value?.profile_path}`
  } else if (personProps.person?.source === 'douban') {
    if (!personInfo.value?.avatar) return personIcon
    if (typeof personInfo.value?.avatar === 'object') {
      url = personInfo.value?.avatar?.normal
    } else {
      url = personInfo.value?.avatar
    }
  } else if (personProps.person?.source === 'bangumi') {
    if (!personInfo.value?.images) return personIcon
    url = personInfo.value?.images?.medium
  } else {
    return personIcon
  }
  if (globalSettings.GLOBAL_IMAGE_CACHE && url)
    return `${import.meta.env.VITE_API_BASE_URL}system/cache/image?url=${encodeURIComponent(url)}`
  return url
}

// 人物姓名
function getPersonName() {
  return personInfo.value?.name
}

// 人物角色
function getPersonCharacter() {
  if (personProps.person?.source === 'bangumi') {
    if (!personInfo.value?.career) return ''
    return personInfo.value?.career.join('、')
  } else {
    return personInfo.value?.character
  }
}

// 人物详情
function goPersonDetail() {
  if (!personInfo.value?.id) return
  router.push({
    path: '/person',
    query: {
      personid: personInfo.value?.id,
      source: personInfo.value?.source,
    },
  })
}
</script>

<template>
  <VHover>
    <template #default="hover">
      <VCard
        v-bind="hover.props"
        :height="personProps.height"
        :width="personProps.width"
        :class="{
          'transition transform-cpu duration-300 -translate-y-1': hover.isHovering,
        }"
        @click.stop="goPersonDetail"
      >
        <div class="person-card relative cursor-pointer ring-gray-700">
          <div style="padding-block-end: 150%">
            <div class="absolute inset-0 flex h-full w-full flex-col items-center p-2">
              <div class="relative mt-2 mb-4 flex h-1/2 w-full justify-center">
                <VAvatar
                  size="100"
                  :class="{
                    'ring-1 ring-gray-700': isImageLoaded,
                  }"
                >
                  <VImg :src="getPersonImage()" cover @load="isImageLoaded = true" />
                </VAvatar>
              </div>
              <div class="w-full truncate text-center font-bold">
                {{ getPersonName() }}
              </div>
              <div class="overflow-hidden whitespace-normal text-center text-sm text-ellipsis line-clamp-2">
                {{ getPersonCharacter() }}
              </div>
              <div class="absolute bottom-0 left-0 right-0 h-12 rounded-b" />
            </div>
          </div>
        </div>
      </VCard>
    </template>
  </VHover>
</template>

<style lang="scss" scoped>
.person-card {
  background-image: linear-gradient(
    45deg,
    rgb工(var(--v-theme-background), 0.3),
    rgba(var(--v-theme-surface), 0.3) 60%
  );
}

.person-card:hover {
  background-image: linear-gradient(
    45deg,
    rgba(var(--v-theme-background), 0.3),
    rgba(var(--v-custom-background), 0.3) 60%
  );
}
</style>
