<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { ScheduleInfo } from '@/api/types'

// 提示框
const $toast = useToast()

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

// 任务状态颜色
function getSchedulerColor(status: string) {
  switch (status) {
    case '正在运行':
      return 'success'
    case '已停止':
      return 'error'
    case '等待':
      return ''
    default:
      return ''
  }
}

// 执行命令
function runCommand(id: string) {
  try {
    // 异步提交
    api.get('system/runscheduler', {
      params: {
        jobid: id,
      },
    })
    $toast.success('定时作业执行请求提交成功！')
    // 1秒后刷新数据
    setTimeout(() => {
      loadSchedulerList()
    }, 1000)
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  loadSchedulerList()

  // 启动定时器
  refreshTimer = setInterval(() => {
    loadSchedulerList()
  }, 5000)
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
  <VCard>
    <VCardItem>
      <VCardTitle>定时作业</VCardTitle>
      <VCardSubtitle>包含系统内置服务以及插件提供的服务，手动执行不会影响作业正常的时间表。</VCardSubtitle>
    </VCardItem>
    <VTable class="text-no-wrap">
      <thead>
        <tr>
          <th scope="col">提供者</th>
          <th scope="col">任务名称</th>
          <th scope="col">任务状态</th>
          <th scope="col">下一次执行时间</th>
          <th scope="col" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="scheduler in schedulerList" :key="scheduler.id">
          <td>
            {{ scheduler.provider }}
          </td>
          <td>
            {{ scheduler.name }}
          </td>
          <td>
            <VChip :color="getSchedulerColor(scheduler.status)">
              {{ scheduler.status }}
            </VChip>
          </td>
          <td>
            {{ scheduler.next_run }}
          </td>
          <td>
            <VBtn size="small" :disabled="scheduler.status === '正在运行'" @click="runCommand(scheduler.id)">
              <template #prepend>
                <VIcon>mdi-play</VIcon>
              </template>
              执行
            </VBtn>
          </td>
        </tr>
        <tr v-if="schedulerList.length === 0">
          <td colspan="4" class="text-center">没有后台服务</td>
        </tr>
      </tbody>
    </VTable>
  </VCard>
</template>
