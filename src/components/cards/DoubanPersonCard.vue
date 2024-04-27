<script lang="ts" setup>
import personIcon from '@images/misc/person-icon.png'
import type { DoubanPerson } from '@/api/types'

const personProps = defineProps({
  person: Object as PropType<DoubanPerson>,
  width: String,
  height: String,
})

// 当前人物
const personInfo = ref(personProps.person)

// 人物图片是否加载
const isImageLoaded = ref(false)

// 人物图片地址
function getPersonImage() {
  if (!personInfo.value?.avatar) return personIcon
  return personInfo.value?.avatar?.large
}

// 打开人物详情
function goPersonDetail() {
  if (!personInfo.value?.id) return
  window.open(`https://movie.douban.com/celebrity/${personInfo.value?.id}/`, '_blank')
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
                  <VImg v-img :src="getPersonImage()" cover @load="isImageLoaded = true" />
                </VAvatar>
              </div>
              <div class="w-full truncate text-center font-bold">
                {{ personInfo?.name }}
              </div>
              <div
                class="overflow-hidden whitespace-normal text-center text-sm"
                style="display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2"
              >
                {{ personInfo?.character }}
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
