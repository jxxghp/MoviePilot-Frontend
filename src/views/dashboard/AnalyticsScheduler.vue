<script setup lang="ts">
import api from '@/api'
import type { ScheduleInfo } from '@/api/types'

// 定时服务列表
const schedulerList = ref<ScheduleInfo[]>([])

// 定时器
let refreshTimer: NodeJS.Timeout | null = null

// 调用API加载定时服务列表
async function loadSchedulerList() {
  try {
    const res: ScheduleInfo[] = await api.get('dashboard/schedule')

    schedulerList.value = res
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  loadSchedulerList()

  // 启动定时器
  refreshTimer = setInterval(() => {
    loadSchedulerList()
  }, 60000)
})

// 组件卸载时停止定时器
onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<template>
  <VHover>
    <template #default="hover">
      <VCard v-bind="hover.props">
        <VCardItem>
          <template #append>
            <VIcon class="cursor-move" v-if="hover.isHovering">mdi-drag</VIcon>
          </template>
          <VCardTitle>后台任务</VCardTitle>
        </VCardItem>

        <VCardText>
          <VList class="card-list" height="250">
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
              <VListItemTitle class="text-center"> 没有后台服务 </VListItemTitle>
            </VListItem>
          </VList>
        </VCardText>
      </VCard>
    </template>
  </VHover>
</template>

<style lang="scss" scoped>
.card-list {
  --v-card-list-gap: 1.5rem;
}

.card-list::-webkit-scrollbar {
  display: none;
}
</style>
