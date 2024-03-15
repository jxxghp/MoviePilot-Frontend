<script setup lang='ts'>
import { CalendarHeatmap } from 'vue3-calendar-heatmap'
import { useTheme } from 'vuetify'
import api from '@/api'
import type { MediaServerActivity, MediaServerActivityDict, MediaServerActivityItem } from '@/api/types'

// 数据
const activityList = ref<MediaServerActivity[]>([])
const selectedActivities = ref<MediaServerActivityItem[]>([])
let activityDict: MediaServerActivityDict

const { name: themeName, global: globalTheme } = useTheme()

const light_colors = ['#eeeeef', '#f5f0ff', '#e6d7f5', '#d8bfe6', '#c9a6d8', '#ba8ec9', '#ac76bb', '#9d5daa', '#8e4599', '#7f2c88', '#701477']
const dark_colors = ['#111726', '#f5f0ff', '#e6d7f5', '#d8bfe6', '#c9a6d8', '#ba8ec9', '#ac76bb', '#9d5daa', '#8e4599', '#7f2c88', '#701477']
const colors = ref<string[]>(light_colors)

// 主题色
watch(
  () => themeName.value,
  (newValue, oldValue) => {
    if (newValue === 'light')
      colors.value = light_colors
    else
      colors.value = dark_colors
  },
)

async function loadPlayActivity() {
  try {
    activityDict = await api.get('mediaserver/play_activity')
    selectedActivities.value = activityDict[today()].activities || []
    activityList.value = Object.values(activityDict)
  }
  catch (e) {
    console.log(e)
  }
}

function handleDayClick(day: { date: Date; count: number; colorIndex: number }) {
  // 处理日期点击事件，更新 selectedActivities
  const date: Date = new Date(day.date)
  date.setHours(date.getHours() + 8)
  const key = date.toISOString().slice(0, 10)
  selectedActivities.value = activityDict[key]?.activities || []
}

// 获取当前日期
function today() {
  const date = new Date()
  date.setHours(date.getHours() + 8)
  return date.toISOString().slice(0, 10)
}

function formatIsoDate(isoDate: string) {
  const date = new Date(isoDate)
  const year = date.getFullYear()
  const month = date.getMonth() + 1 // 月份不补零
  const day = date.getDate() // 日不补零
  const hours = String(date.getHours()).padStart(2, '0') // 小时补零
  const minutes = String(date.getMinutes()).padStart(2, '0') // 分钟补零

  let sunMoonEmoji: string
  if (date.getHours() >= 6 && date.getHours() < 18)
    sunMoonEmoji = '🌞' // 太阳
  else
    sunMoonEmoji = '🌜' // 月亮

  return `${year}-${month}-${day} ${hours}:${minutes} ${sunMoonEmoji}`
}

onMounted(() => {
  loadPlayActivity()
})
</script>

<template>
  <VCard>
    <VCardItem>
      <VCardTitle>活动图</VCardTitle>
    </VCardItem>
    <CalendarHeatmap
      :values="activityList"
      :end-date="new Date()"
      no-data-text="无记录"
      :tooltip-formatter="(v) => { return `${v.date.getMonth() + 1}月${v.date.getDate()}日，${Math.round(v.count / 2)}观看` }"
      :max="50"
      :round="2"
      :range-color="colors"
      :dark-mode="themeName !== 'light'"
      :locale="{
        months: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
        days: ['日', '一', '二', '三', '四', '五', '六'],
        on: '在',
        less: '少',
        more: '更多',
      }"
      @dayClick="handleDayClick"
    />
    <VCardText>
      <VList
        class="card-list"
        height="100"
      >
        <VListItem v-for="(activity, index) in selectedActivities" :key="activity.id">
          <template #prepend>
            <VAvatar
              size="40"
              variant="tonal"
              color=""
              class="me-3"
            >
              {{ selectedActivities[index].name[0] }}
            </VAvatar>
          </template>

          <VListItemTitle class="mb-1">
            <span class="text-sm font-weight-medium">{{ formatIsoDate(selectedActivities[index].date) }}</span>
          </VListItemTitle>

          <VListItemSubtitle class="text-xs">
            {{ selectedActivities[index].name }}
          </VListItemSubtitle>
        </VListItem>

        <VListItem v-if="selectedActivities.length === 0">
          <VListItemTitle class="text-center">
            没有观看记录
          </VListItemTitle>
        </VListItem>
      </VList>
    </VCardText>
  </VCard>
</template>

<style lang='scss'>
//底部less more div隐藏
.vch__legend {
  display: none;
}

// 整个容器
.vch__container {
  padding-inline-start: 1rem;
  padding-inline-end: 1rem;
}

// 左侧星期标签 顶部月份标签 字体颜色
.vch__days__labels__wrapper,
.vch__months__labels__wrapper {
  font-size: 8px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

// 热力图
.vch__year__wrapper {

}
</style>
