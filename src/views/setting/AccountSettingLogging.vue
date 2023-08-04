<script lang="ts" setup>
import store from '@/store'

// 日志列表
const logs = ref<string[]>([])

// SSE持续获取日志
function startSSELogging() {
  const token = store.state.auth.token
  if (token) {
    const eventSource = new EventSource(
      `${import.meta.env.VITE_API_BASE_URL}system/logging?token=${token}`,
    )

    eventSource.addEventListener('message', (event) => {
      const message = event.data
      if (message)
        logs.value.push(message)
    })

    onBeforeUnmount(() => {
      eventSource.close()
    })
  }
}

onMounted(() => {
  startSSELogging()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="实时日志">
        <VCardText>
          <div
            v-if="logs.length === 0"
            class="mt-5 w-full text-center text-gray-500 text-sm flex flex-col items-center"
          >
            <VProgressCircular
              size="48"
              indeterminate
              color="primary"
            />
            <span class="mt-3">正在刷新 ...</span>
          </div>
          <div v-for="(log, i) in logs" :key="i">
            {{ log }}
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
