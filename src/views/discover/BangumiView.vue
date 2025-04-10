<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'

// 过滤参数
const filterParams = reactive({
  'type': 2,
  'cat': null as string | null,
  'sort': 'rank', // date/rank
  'year': null as number | null,
})

// Bangumi cat字典
/**
 * 0 为 其他
1 为 TV
2 为 OVA
3 为 Movie
5 为 WEB
 */
const bangumiCatDict: Record<string, string> = {
  '0': '其他',
  '1': 'TV',
  '2': 'OVA',
  '3': 'Movie',
  '5': 'WEB',
}

// Bangumi排序字典
const bangumiSortDict = {
  'rank': '排名',
  'date': '日期',
}

// 年份字典，自动生成最近10年
const yearDict: Record<number, number> = {}
const currentYear = new Date().getFullYear()
for (let i = 0; i < 10; i++) {
  yearDict[currentYear - i] = currentYear - i
}

// 当前Key
const currentKey = ref(0)

// 类型和过滤参数变化后重新刷新列表
watch([filterParams], () => {
  currentKey.value++
})
</script>

<template>
  <div class="filter-container">
    <div class="filter-row">
      <div class="filter-label">
        <VIcon icon="mdi-shape-outline" size="x-small" class="mr-1" />
        类别
      </div>
      <div class="chip-wrapper">
        <div 
          v-for="(value, key) in bangumiCatDict"
          :key="key"
          class="custom-chip"
          :class="{ 'active-chip': filterParams.cat === key }"
          @click="filterParams.cat = filterParams.cat === key ? null : key"
        >
          {{ value }}
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
          v-for="(value, key) in bangumiSortDict"
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
        <VIcon icon="mdi-calendar-outline" size="x-small" class="mr-1" />
        年份
      </div>
      <div class="chip-wrapper">
        <div 
          v-for="(value, key) in yearDict"
          :key="key"
          class="custom-chip"
          :class="{ 'active-chip': filterParams.year === key }"
          @click="filterParams.year = filterParams.year === key ? null : key"
        >
          {{ value }}
        </div>
      </div>
    </div>
  </div>
  
  <div>
    <MediaCardListView :key="currentKey" apipath="discover/bangumi" :params="filterParams" />
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
