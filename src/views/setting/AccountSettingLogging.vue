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
          <div v-for="(log, i) in logs" :key="i">
            {{ log }}
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
