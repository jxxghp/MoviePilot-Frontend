<script setup lang="ts">
import MediaCardListView from './MediaCardListView.vue'
import api from '@/api'
import personIcon from '@images/misc/person.png'
import type { Person } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'

// 输入参数
const personProps = defineProps({
  personid: String,
  type: String,
  source: String,
})

// 媒体详情
const personDetail = ref<Person>({} as Person)

// 是否已加载完成
const isRefreshed = ref(false)

// 人物图片是否加载
const isImageLoaded = ref(false)

// 调用API查询详情
async function getPersonDetail() {
  if (personProps.personid) {
    if (personProps.source === 'themoviedb') {
      personDetail.value = await api.get(`tmdb/person/${personProps.personid}`)
    } else if (personProps.source === 'douban') {
      personDetail.value = await api.get(`douban/person/${personProps.personid}`)
    } else if (personProps.source === 'bangumi') {
      personDetail.value = await api.get(`bangumi/person/${personProps.personid}`)
    }
    isRefreshed.value = true
  }
}

// 人物图片地址
function getPersonImage() {
  if (personProps.source === 'themoviedb') {
    if (!personDetail.value?.profile_path) return personIcon
    return `https://image.tmdb.org/t/p/w600_and_h900_bestv2${personDetail.value?.profile_path}`
  } else if (personProps.source === 'douban') {
    if (!personDetail.value?.avatar) return personIcon
    if (typeof personDetail.value?.avatar === 'object') {
      return personDetail.value?.avatar?.normal
    } else {
      return personDetail.value?.avatar
    }
  } else if (personProps.source === 'bangumi') {
    if (!personDetail.value?.images) return personIcon
    return personDetail.value?.images?.medium
  } else {
    return personIcon
  }
}

// 将别名数组拆分为、分隔的字符串
function getAlsoKnownAs() {
  if (!personDetail.value?.also_known_as) return ''
  if (personProps.source === 'themoviedb') {
    return '别名：' + personDetail.value.also_known_as.join('、')
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
  }
  return `/browse/${apipath}/person/credits/${personDetail.value.id}?title=参演作品`
}

// 参演作品API路径
function getPersonCreditsApiPath() {
  let apipath = 'tmdb'
  if (personProps.source === 'douban') {
    apipath = 'douban'
  } else if (personProps.source === 'bangumi') {
    apipath = 'bangumi'
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
        <VImg v-img :src="getPersonImage()" cover @load="isImageLoaded = true" />
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
        <p class="pt-2 text-sm lg:text-base" style="overflow-wrap: break-word">
          {{ personDetail.biography }}
        </p>
      </div>
    </div>
    <div>
      <div class="slider-header">
        <RouterLink :to="getPersonCreditsPath()" class="slider-title">
          <span>参演作品</span>
          <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
        </RouterLink>
      </div>
      <MediaCardListView :apipath="getPersonCreditsApiPath()" />
    </div>
  </div>
  <NoDataFound
    v-if="!personDetail.id && isRefreshed"
    error-code="500"
    error-title="出错啦！"
    error-description="无法获取到媒体信息，请检查网络连接。"
  />
</template>
