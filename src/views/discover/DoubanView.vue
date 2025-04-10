<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'

// 电影或者电视剧 movies/tvs
const type = ref('movies')

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

// 豆瓣风格字典
const categoryDict = {
  '喜剧': '喜剧',
  '爱情': '爱情',
  '动作': '动作',
  '科幻': '科幻',
  '动画': '动画',
  '悬疑': '悬疑',
  '犯罪': '犯罪',
  '惊悚': '惊悚',
  '冒险': '冒险',
  '音乐': '音乐',
  '历史': '历史',
  '奇幻': '奇幻',
  '恐怖': '恐怖',
  '战争': '战争',
  '传记': '传记',
  '歌舞': '歌舞',
  '武侠': '武侠',
  '情色': '情色',
  '灾难': '灾难',
  '西部': '西部',
  '纪录片': '纪录片',
  '短片': '短片',
}

// 地区字典
const zoneDict = {
  '华语': '华语',
  '欧美': '欧美',
  '韩国': '韩国',
  '日本': '日本',
  '中国大陆': '中国大陆',
  '美国': '美国',
  '中国香港': '中国香港',
  '中国台湾': '中国台湾',
  '英国': '英国',
  '法国': '法国',
  '德国': '德国',
  '意大利': '意大利',
  '西班牙': '西班牙',
  '印度': '印度',
  '泰国': '泰国',
  '俄罗斯': '俄罗斯',
  '加拿大': '加拿大',
  '澳大利亚': '澳大利亚',
  '爱尔兰': '爱尔兰',
  '瑞典': '瑞典',
  '巴西': '巴西',
  '丹麦': '丹麦',
}

// 年代字典
const yearDict: Record<string, string> = {
  '2020年代': '2020年代',
  '2010年代': '2010年代',
  '2000年代': '2000年代',
  '90年代': '90年代',
  '80年代': '80年代',
  '70年代': '70年代',
  '60年代': '60年代',
}

// 往年代字典中追加当前年份及往前5年的字典
const currentYear = new Date().getFullYear()
for (let i = 0; i < 6; i++) {
  yearDict[`${currentYear - i}`] = `${currentYear - i}`
}

// 豆瓣过滤参数
const doubanSortDict = {
  'U': '综合排序',
  'R': '首播时间',
  'T': '近期热度',
  'S': '高分优先',
}

// 风格、年代、地区变化时，以,分隔拼接到tags参数
watch([doubanCategory, doubanZone, doubanYear], () => {
  filterParams.tags = [doubanCategory.value, doubanZone.value, doubanYear.value].filter(Boolean).join(',')
})

// 当前Key
const currentKey = ref(0)

// 类型和过滤参数变化后重新刷新列表
watch([type, filterParams], () => {
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
  <div class="filter-container">
    <div class="filter-row">
      <div class="filter-label">
        <VIcon icon="mdi-shape-outline" size="x-small" class="mr-1" />
        类型
      </div>
      <div class="chip-wrapper">
        <div 
          class="custom-chip"
          :class="{ 'active-chip': type === 'movies' }"
          @click="type = 'movies'"
        >
          电影
        </div>
        <div 
          class="custom-chip"
          :class="{ 'active-chip': type === 'tvs' }"
          @click="type = 'tvs'"
        >
          电视剧
        </div>
      </div>
    </div>
    
    <div class="filter-row">
      <div class="filter-label">
        <VIcon icon="mdi-sort-variant" size="x-small" class="mr-1" />
        排序
      </div>
      <div class="chip-wrapper">
        <div 
          v-for="(value, key) in doubanSortDict"
          :key="key"
          class="custom-chip"
          :class="{ 'active-chip': filterParams.sort === key }"
          @click="filterParams.sort = key"
        >
          {{ value }}
        </div>
      </div>
    </div>
    
    <div class="filter-row">
      <div class="filter-label">
        <VIcon icon="mdi-tag-multiple-outline" size="x-small" class="mr-1" />
        风格
      </div>
      <div class="chip-wrapper">
        <div 
          v-for="(value, key) in categoryDict"
          :key="key"
          class="custom-chip"
          :class="{ 'active-chip': doubanCategory === key }"
          @click="doubanCategory = doubanCategory === key ? '' : key"
        >
          {{ value }}
        </div>
      </div>
    </div>
    
    <div class="filter-row">
      <div class="filter-label">
        <VIcon icon="mdi-map-marker-outline" size="x-small" class="mr-1" />
        地区
      </div>
      <div class="chip-wrapper">
        <div 
          v-for="(value, key) in zoneDict"
          :key="key"
          class="custom-chip"
          :class="{ 'active-chip': doubanZone === key }"
          @click="doubanZone = doubanZone === key ? '' : key"
        >
          {{ value }}
        </div>
      </div>
    </div>
    
    <div class="filter-row">
      <div class="filter-label">
        <VIcon icon="mdi-calendar-outline" size="x-small" class="mr-1" />
        年代
      </div>
      <div class="chip-wrapper">
        <div 
          v-for="(value, key) in yearDict"
          :key="key"
          class="custom-chip"
          :class="{ 'active-chip': doubanYear === key }"
          @click="doubanYear = doubanYear === key ? '' : key"
        >
          {{ value }}
        </div>
      </div>
    </div>
  </div>
  
  <div>
    <MediaCardListView :key="currentKey" :apipath="`discover/douban_${type}`" :params="filterParams" />
  </div>
</template>

<style lang="scss" scoped>
.filter-container {
  padding: 0 16px 16px;
}

.filter-row {
  display: flex;
  margin-bottom: 16px;
  align-items: flex-start;
  
  @media (max-width: 768px) {
    margin-bottom: 12px;
  }
}

.filter-label {
  display: flex;
  align-items: center;
  font-size: 0.9rem;
  font-weight: 500;
  min-width: 60px;
  margin-right: 16px;
  margin-top: 8px;
  white-space: nowrap;
}

.chip-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  
  @media (max-width: 768px) {
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 8px;
    margin-bottom: 4px;
    width: 100%;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    
    &::-webkit-scrollbar {
      display: none;
    }
  }
}

.custom-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 12px;
  background-color: rgba(var(--v-theme-surface), 0.8);
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  white-space: nowrap;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  
  &:hover {
    background-color: rgba(var(--v-theme-surface), 1);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
  
  &.active-chip {
    background-color: rgba(var(--v-theme-primary), 0.12);
    color: rgb(var(--v-theme-primary));
    font-weight: 500;
    border-color: rgba(var(--v-theme-primary), 0.5);
  }
  
  @media (max-width: 768px) {
    flex-shrink: 0;
  }
}
</style>
