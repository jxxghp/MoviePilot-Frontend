<script setup lang="ts">
import AppFilterBar from '@/components/filter/AppFilterBar.vue'
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 过滤参数
const filterParams = reactive({
  'type': 2,
  'cat': null,
  'sort': 'rank', // date/rank
  'year': null,
})

// Bangumi cat字典
/**
 * 0 为 其他
1 为 TV
2 为 OVA
3 为 Movie
5 为 WEB
 */
const bangumiCatDict = {
  '0': t('bangumi.cat.other'),
  '1': t('bangumi.cat.tv'),
  '2': t('bangumi.cat.ova'),
  '3': t('bangumi.cat.movie'),
  '5': t('bangumi.cat.web'),
}

// Bangumi排序字典
const bangumiSortDict = {
  'rank': t('bangumi.sortType.rank'),
  'date': t('bangumi.sortType.date'),
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
const secondaryFilterCount = computed(() => {
  let count = 0
  if (filterParams.sort && filterParams.sort !== 'rank') count += 1
  if (filterParams.year) count += 1
  return count
})
</script>

<template>
  <AppFilterBar :active-count="secondaryFilterCount">
    <template #primary>
      <div class="app-filter-row">
        <VLabel class="app-filter-label">{{ t('bangumi.category') }}</VLabel>
        <VChipGroup v-model="filterParams.cat" class="app-filter-chips">
          <VChip v-for="(value, key) in bangumiCatDict" :key="key" :value="key">
            {{ value }}
          </VChip>
        </VChipGroup>
      </div>
    </template>
    <div class="app-filter-row">
      <VLabel class="app-filter-label">{{ t('bangumi.sort') }}</VLabel>
      <VChipGroup v-model="filterParams.sort" class="app-filter-chips">
        <VChip v-for="(value, key) in bangumiSortDict" :key="key" :value="key">
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>
    <div class="app-filter-row">
      <VLabel class="app-filter-label">{{ t('bangumi.year') }}</VLabel>
      <VChipGroup v-model="filterParams.year" class="app-filter-chips">
        <VChip v-for="(value, key) in yearDict" :key="key" :value="key">
          {{ value }}
        </VChip>
      </VChipGroup>
    </div>
  </AppFilterBar>
  <div>
    <MediaCardListView
      :key="currentKey"
      apipath="discover/bangumi"
      :params="filterParams"
      :hide-type-badge="Boolean(filterParams.cat)"
    />
  </div>
</template>
