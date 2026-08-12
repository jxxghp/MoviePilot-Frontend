<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 豆瓣影视与音乐共用来源标签，音乐模式使用独立的音乐数据接口。
const type = ref<'movies' | 'tvs' | 'music'>('movies')

// 过滤参数
const filterParams = reactive({
  'sort': 'U',
  'tags': '',
})

// 豆瓣风格类型
const doubanCategory = ref('')

// 地区
const doubanZone = ref('')

// 年代
const doubanYear = ref('')
const coverFilter = ref<'all' | 'with_cover'>('all')
const isMusic = computed(() => type.value === 'music')

// 豆瓣风格字典
const categoryDict = {
  '喜剧': t('douban.genreType.comedy'),
  '爱情': t('douban.genreType.romance'),
  '动作': t('douban.genreType.action'),
  '科幻': t('douban.genreType.scienceFiction'),
  '动画': t('douban.genreType.animation'),
  '悬疑': t('douban.genreType.mystery'),
  '犯罪': t('douban.genreType.crime'),
  '惊悚': t('douban.genreType.thriller'),
  '冒险': t('douban.genreType.adventure'),
  '音乐': t('douban.genreType.music'),
  '历史': t('douban.genreType.history'),
  '奇幻': t('douban.genreType.fantasy'),
  '恐怖': t('douban.genreType.horror'),
  '战争': t('douban.genreType.war'),
  '传记': t('douban.genreType.biography'),
  '歌舞': t('douban.genreType.musical'),
  '武侠': t('douban.genreType.martialArts'),
  '情色': t('douban.genreType.erotic'),
  '灾难': t('douban.genreType.disaster'),
  '西部': t('douban.genreType.western'),
  '纪录片': t('douban.genreType.documentary'),
  '短片': t('douban.genreType.shortFilm'),
}

// 地区字典
const zoneDict = {
  '华语': t('douban.zoneType.chinese'),
  '欧美': t('douban.zoneType.europeanAmerican'),
  '韩国': t('douban.zoneType.korean'),
  '日本': t('douban.zoneType.japanese'),
  '中国大陆': t('douban.zoneType.mainlandChina'),
  '美国': t('douban.zoneType.usa'),
  '中国香港': t('douban.zoneType.hongKong'),
  '中国台湾': t('douban.zoneType.taiwan'),
  '英国': t('douban.zoneType.uk'),
  '法国': t('douban.zoneType.france'),
  '德国': t('douban.zoneType.germany'),
  '意大利': t('douban.zoneType.italy'),
  '西班牙': t('douban.zoneType.spain'),
  '印度': t('douban.zoneType.india'),
  '泰国': t('douban.zoneType.thailand'),
  '俄罗斯': t('douban.zoneType.russia'),
  '加拿大': t('douban.zoneType.canada'),
  '澳大利亚': t('douban.zoneType.australia'),
  '爱尔兰': t('douban.zoneType.ireland'),
  '瑞典': t('douban.zoneType.sweden'),
  '巴西': t('douban.zoneType.brazil'),
  '丹麦': t('douban.zoneType.denmark'),
}

// 年代字典
const yearDict: Record<string, string> = {
  '2020年代': t('douban.yearType.2020s'),
  '2010年代': t('douban.yearType.2010s'),
  '2000年代': t('douban.yearType.2000s'),
  '90年代': t('douban.yearType.1990s'),
  '80年代': t('douban.yearType.1980s'),
  '70年代': t('douban.yearType.1970s'),
  '60年代': t('douban.yearType.1960s'),
}

// 往年代字典中追加当前年份及往前5年的字典
const currentYear = new Date().getFullYear()
for (let i = 0; i < 6; i++) {
  yearDict[`${currentYear - i}`] = `${currentYear - i}`
}

// 豆瓣过滤参数
const doubanSortDict = {
  'U': t('douban.sortType.comprehensive'),
  'R': t('douban.sortType.releaseDate'),
  'T': t('douban.sortType.recentHot'),
  'S': t('douban.sortType.highScore'),
}

const listApiPath = computed(() => (isMusic.value ? 'music/explore' : `discover/douban_${type.value}`))
const listParams = computed<Record<string, unknown>>(() => {
  if (isMusic.value) {
    return {
      count: 30,
      source: 'doubanmusic',
      with_cover: coverFilter.value === 'with_cover',
    }
  }
  return { ...filterParams }
})

// 风格、年代、地区变化时，以,分隔拼接到tags参数
watch([doubanCategory, doubanZone, doubanYear], () => {
  filterParams.tags = [doubanCategory.value, doubanZone.value, doubanYear.value].filter(Boolean).join(',')
})

// 当前Key
const currentKey = ref(0)

// 类型和过滤参数变化后重新刷新列表
watch([type, filterParams, coverFilter], () => {
  if (!type.value) {
    type.value = 'movies'
  }
  if (!filterParams.sort) {
    filterParams.sort = 'U'
  }
  currentKey.value++
})
</script>

<template>
  <div class="px-3">
    <div class="flex justify-start align-center">
      <div class="mr-5">
        <VLabel>{{ t('douban.type') }}</VLabel>
      </div>
      <VChipGroup v-model="type">
        <VChip :color="type == 'movies' ? 'primary' : ''" filter tile value="movies">{{ t('mediaType.movie') }}</VChip>
        <VChip :color="type == 'tvs' ? 'primary' : ''" filter tile value="tvs">{{ t('mediaType.tv') }}</VChip>
        <VChip data-testid="douban-type-music" :color="type == 'music' ? 'primary' : ''" filter tile value="music">
          {{ t('mediaType.music') }}
        </VChip>
      </VChipGroup>
    </div>
    <div v-if="!isMusic" class="flex justify-start align-center">
      <div class="mr-5">
        <VLabel>{{ t('douban.sort') }}</VLabel>
      </div>
      <VChipGroup v-model="filterParams.sort">
        <VChip
          :color="filterParams.sort == key ? 'primary' : ''"
          filter
          tile
          :value="key"
          v-for="(value, key) in doubanSortDict"
          :key="key"
        >
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>
    <div v-if="!isMusic" class="flex justify-start align-center">
      <div class="mr-5">
        <VLabel>{{ t('douban.genre') }}</VLabel>
      </div>
      <VChipGroup v-model="doubanCategory">
        <VChip
          :color="doubanCategory == key ? 'primary' : ''"
          filter
          tile
          :value="key"
          v-for="(value, key) in categoryDict"
          :key="key"
        >
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>
    <div v-if="!isMusic" class="flex justify-start align-center">
      <div class="mr-5">
        <VLabel>{{ t('douban.zone') }}</VLabel>
      </div>
      <VChipGroup v-model="doubanZone">
        <VChip
          :color="doubanZone == key ? 'primary' : ''"
          filter
          tile
          :value="key"
          v-for="(value, key) in zoneDict"
          :key="key"
        >
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>
    <div v-if="!isMusic" class="flex justify-start align-center">
      <div class="mr-5">
        <VLabel>{{ t('douban.year') }}</VLabel>
      </div>
      <VChipGroup v-model="doubanYear">
        <VChip
          :color="doubanYear == key ? 'primary' : ''"
          filter
          tile
          :value="key"
          v-for="(value, key) in yearDict"
          :key="key"
        >
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>
    <div v-else class="flex justify-start align-center">
      <div class="mr-5">
        <VLabel>{{ t('music.filter.cover') }}</VLabel>
      </div>
      <VChipGroup v-model="coverFilter" mandatory>
        <VChip value="all" filter tile>{{ t('music.filter.all') }}</VChip>
        <VChip value="with_cover" filter tile>{{ t('music.filter.withCover') }}</VChip>
      </VChipGroup>
    </div>
  </div>
  <div>
    <MediaCardListView :key="currentKey" :apipath="listApiPath" :params="listParams" />
  </div>
</template>
