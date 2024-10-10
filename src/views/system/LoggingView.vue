<script lang="ts" setup>
// 日志列表
const logs = ref<string[]>([])

// 表头
const headers = [
  { title: '级别', value: 'level' },
  { title: '时间', value: 'time' },
  { title: '程序', value: 'program' },
  { title: '内容', value: 'content' },
]

// SSE消息对象
let eventSource: EventSource | null = null

// SSE持续获取日志
function startSSELogging() {
  eventSource = new EventSource(`${import.meta.env.VITE_API_BASE_URL}system/logging`)
  eventSource.addEventListener('message', event => {
    const message = event.data
    if (message) logs.value.push(message)
  })
}

// 从日志中提取日志详情
function extractLogDetailsFromLogs(
  logs: string[],
): { level: string; time: string; program: string; content: string }[] {
  const logDetails: { level: string; time: string; program: string; content: string }[] = []

  const logPattern = /^【(.*?)】[0-9\-:]*\s(.*?)\s-\s(.*?)\s-\s(.*)$/

  for (const log of logs) {
    const matches = RegExp(logPattern).exec(log)
    if (matches && matches.length === 5) {
      const [_, level, time, program, content] = matches
      logDetails.unshift({ level, time, program, content })
    }
  }

  return logDetails
}

// 计算日志颜色
function getLogColor(level: string): string {
  switch (level) {
    case 'DEBUG':
      return 'primary'
    case 'INFO':
      return 'secondary'
    case 'WARNING':
      return 'warning'
    case 'ERROR':
      return 'error'
    default:
      return 'secondary'
  }
}

// 拆分日志数据计算属性
const extractLogDetails = computed(() => {
  return extractLogDetailsFromLogs(logs.value)
})

onMounted(() => {
  startSSELogging()
})

onBeforeUnmount(() => {
  if (eventSource) eventSource.close()
})
</script>

<template>
  <LoadingBanner v-if="logs.length === 0" class="mt-12" text="正在刷新 ..." />
  <div v-else>
    <VTable class="table-rounded" hide-default-footer disable-sort>
      <tbody>
        <VDataTableVirtual
          :headers="headers"
          :items="extractLogDetails"
          height="100%"
          density="compact"
          hover
          hide-default-header
        >
          <template #item.level="{ item }">
            <VChip size="small" :color="getLogColor(item.level)" variant="elevated" v-text="item.level" />
          </template>
          <template #item.time="{ item }">
            <span class="text-sm">{{ item.time }}</span>
          </template>
          <template #item.program="{ item }">
            <h6 class="text-sm font-weight-medium">{{ item.program }}</h6>
          </template>
          <template #item.content="{ item }">
            <span class="text-sm">
              {{ item.content }}
            </span>
          </template>
        </VDataTableVirtual>
      </tbody>
    </VTable>
  </div>
</template>
