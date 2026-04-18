<script setup lang="ts">
import api from '@/api'
import { getLogoUrl } from '@/utils/imageUtils'
import tvdb from '@images/logos/thetvdb.jpeg'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

interface Status {
  OK: string
  Fail: string
  Normal: string
  Doing?: string
}

interface TargetItem {
  id: string
  icon: string
  name: string
}

interface Address {
  id: string
  image: string
  name: string
  status: keyof Status
  time: string
  message: string
  btndisable: boolean
}

function resolveTargetImage(icon: string) {
  if (icon === 'tvdb') return tvdb
  return getLogoUrl(icon)
}

const targets = ref<Address[]>([])

const resolveStatusColor: Status = {
  OK: 'success',
  Fail: 'error',
  Normal: '',
  Doing: 'warning',
}

const abortControllers = new Set<AbortController>()
const isUnmounting = ref(false)

async function loadTargets() {
  // 测试项由后端下发，前端只负责展示，避免再把可测试目标和校验规则留在客户端。
  const result: { [key: string]: any } = await api.get('system/nettest/targets')
  if (!result.success || !Array.isArray(result.data)) {
    targets.value = []
    return
  }

  targets.value = result.data.map((item: TargetItem) => ({
    id: item.id,
    image: resolveTargetImage(item.icon),
    name: item.name,
    status: 'Normal',
    time: '',
    message: t('netTest.notTested'),
    btndisable: false,
  }))
}

// 调用API测试网络连接
async function netTest(index: number) {
  const target = targets.value[index]
  if (!target) return

  // 页面切换时需要主动中止请求，否则自动轮询中的旧请求会回写已卸载页面状态。
  const abortController = new AbortController()
  abortControllers.add(abortController)

  try {
    const { signal } = abortController

    target.btndisable = true
    target.status = 'Doing'
    target.message = t('netTest.testing')

    const result: { [key: string]: any } = await api.get('system/nettest', {
      params: {
        target_id: target.id,
      },
      signal,
    })

    if (result.success) {
      target.status = 'OK'
      target.message = t('netTest.normal')
    } else {
      target.status = 'Fail'
      target.message = result.message
    }
    target.time = result.data?.time
    target.btndisable = false
  } catch (error) {
    if (!isUnmounting.value) {
      target.status = 'Fail'
      target.message = error instanceof Error ? error.message : t('netTest.notTested')
      target.btndisable = false
    }
  } finally {
    abortControllers.delete(abortController)
  }
}

// 加载时测试所有连接
onMounted(async () => {
  isUnmounting.value = false
  await loadTargets()
  // 逐个串行测试，避免同时触发过多外部请求导致结果受限流或代理抖动影响。
  for (let i = 0; !isUnmounting.value && i < targets.value.length; i++) await netTest(i)
})
onBeforeUnmount(() => {
  isUnmounting.value = true
  for (const controller of abortControllers) {
    controller.abort()
  }
  abortControllers.clear()
})
</script>

<template>
  <VList lines="two" rounded>
    <template v-for="(target, index) of targets" :key="target.id">
      <VListItem>
        <template #prepend>
          <VAvatar :image="target.image" />
        </template>
        <VListItemTitle>
          {{ target.name }}
        </VListItemTitle>
        <VListItemSubtitle class="mt-1 me-2">
          <VBadge dot location="start center" offset-x="2" :color="resolveStatusColor[target.status]" class="me-3">
            <span class="ms-4">{{ target.message }}</span>
          </VBadge>

          <span v-if="target.time" class="text-xs text-wrap text-disabled"> {{ target.time }} ms </span>
        </VListItemSubtitle>
        <template #append>
          <VBtn size="small" icon="mdi-connection" :disabled="target.btndisable" @click="netTest(index)" />
        </template>
      </VListItem>
      <VDivider inset v-if="index !== targets.length - 1" />
    </template>
  </VList>
</template>
