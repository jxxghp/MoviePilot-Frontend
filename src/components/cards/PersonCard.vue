<script lang="ts" setup>
import personIcon from '@images/misc/person-icon.png'
import type { Person } from '@/api/types'
import router from '@/router'

const personProps = defineProps({
  person: Object as PropType<Person>,
  width: String,
  height: String,
})

// 当前人物
const personInfo = ref(personProps.person)

// 人物图片是否加载
const isImageLoaded = ref(false)

// 人物图片地址
function getPersonImage() {
  if (personProps.person?.source === 'themoviedb') {
    if (!personInfo.value?.profile_path) return personIcon
    return `https://image.tmdb.org/t/p/w600_and_h900_bestv2${personInfo.value?.profile_path}`
  } else if (personProps.person?.source === 'douban') {
    if (!personInfo.value?.avatar) return personIcon
    if (typeof personInfo.value?.avatar === 'object') {
      return personInfo.value?.avatar?.normal
    } else {
      return personInfo.value?.avatar
    }
  } else if (personProps.person?.source === 'bangumi') {
    if (!personInfo.value?.images) return personIcon
    return personInfo.value?.images?.medium
  } else {
    return personIcon
  }
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
        class="rounded-lg"
        :class="{
          'transition transform-cpu duration-300 scale-105': hover.isHovering,
        }"
        @click.stop="goPersonDetail"
      >
        <div
          class="person-card relative transform-gpu cursor-pointer rounded shadow transition duration-150 ease-in-out scale-100 ring-gray-700"
        >
          <div style="padding-block-end: 150%">
            <div class="absolute inset-0 flex h-full w-full flex-col items-center p-2">
              <div class="relative mt-2 mb-4 flex h-1/2 w-full justify-center">
                <VAvatar
                  size="120"
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
              <div
                class="overflow-hidden whitespace-normal text-center text-sm"
                style="display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2"
              >
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

<style lang="scss">
.person-card {
  background-image: linear-gradient(45deg, rgb(var(--v-theme-background)), rgb(var(--v-theme-surface)) 60%);
}

.person-card:hover {
  background-image: linear-gradient(45deg, rgb(var(--v-theme-background)), rgb(var(--v-custom-background)) 60%);
}
</style>
