<script setup lang="ts">
import api from '@/api'
import type { ScheduleInfo } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useBackground } from '@/composables/useBackground'

// 国际化
const { t } = useI18n()
const { useDataRefresh } = useBackground()

// 输入参数
const props = defineProps({
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
})

// 定时服务列表
const schedulerList = ref<ScheduleInfo[]>([])

// 调用API加载定时服务列表
async function loadSchedulerList() {
  if (!props.allowRefresh) {
    return
  }
  try {
    const res: ScheduleInfo[] = await api.get('dashboard/schedule')

    schedulerList.value = res
  } catch (e) {
    console.log(e)
  }
}

// 使用数据刷新定时器
useDataRefresh(
  'dashboard-scheduler',
  loadSchedulerList,
  60000, // 60秒间隔
  true // 立即执行
)
</script>

<template>
  <VCard class="dashboard-work-card">
    <VCardItem>
      <VCardTitle>{{ t('dashboard.scheduler') }}</VCardTitle>
    </VCardItem>

    <VCardText class="dashboard-work-content">
      <VList class="card-list">
        <VListItem v-for="item in schedulerList" :key="item.id">
          <template #prepend>
            <VAvatar size="40" variant="tonal" color="" class="me-3">
              {{ item.name[0] }}
            </VAvatar>
          </template>

          <VListItemTitle class="mb-1">
            <span class="text-sm font-weight-medium">{{ item.name }}</span>
          </VListItemTitle>

          <VListItemSubtitle class="text-xs">
            {{ item.next_run }}
          </VListItemSubtitle>

          <template #append>
            <div>
              <h4 class="font-weight-medium">
                {{ item.status }}
              </h4>
            </div>
          </template>
        </VListItem>
        <VListItem v-if="schedulerList.length === 0">
          <VListItemTitle class="text-center"> {{ t('dashboard.noSchedulers') }} </VListItemTitle>
        </VListItem>
      </VList>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.card-list {
  --v-card-list-gap: 1.5rem;

  flex: 1 1 auto;
  min-block-size: 0;
  overflow: auto;
}

.dashboard-work-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
}

.card-list::-webkit-scrollbar {
  display: none;
}

</style>
