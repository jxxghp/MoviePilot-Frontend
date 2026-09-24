<script setup lang="ts">
import api from '@/api'
import { getLogoUrl } from '@/utils/imageUtils'
import moviePilotLogo from '@images/logo.png'
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
  address: string
}

interface Address {
  id: string
  image: string
  name: string
  address: string
  status: keyof Status
  time: string
  message: string
  btndisable: boolean
}

/** 根据目标网址和图标标识解析本地品牌图标；MoviePilot 自有域名统一显示主 Logo。 */
function resolveTargetImage(icon: string, address: string) {
  try {
    const hostname = new URL(address).hostname.toLowerCase()
    if (hostname === 'movie-pilot.org' || hostname.endsWith('.movie-pilot.org')) return moviePilotLogo
  } catch {
    // 无法解析目标地址时继续根据图标标识回退。
  }

  if (icon === 'tvdb') return tvdb
  if (icon === 'site') return ''
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

/** 从后端加载网络测试目录并初始化列表状态。 */
async function loadTargets() {
  // 测试项由后端下发，前端只负责展示，避免再把可测试目标和校验规则留在客户端。
  const result = await api.get<TargetItem[]>('system/nettest/targets')

  targets.value = result.map(item => ({
    id: item.id,
    image: resolveTargetImage(item.icon, item.address),
    name: item.name,
    address: item.address,
    status: 'Normal',
    time: '',
    message: t('netTest.notTested'),
    btndisable: false,
  }))
}

/** 请求后端测试指定目标并更新对应列表状态。 */
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

    const result = await api.get<{ time?: string }>('system/nettest', {
      params: {
        target_id: target.id,
      },
      signal,
      feedback: 'silent',
    })

    target.status = 'OK'
    target.message = t('netTest.normal')
    target.time = result.time || ''
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
  <VList lines="three" rounded>
    <template v-for="(target, index) of targets" :key="target.id">
      <VListItem>
        <template #prepend>
          <VAvatar
            v-if="target.image"
            :image="target.image"
          />
          <VAvatar v-else color="primary" variant="tonal">
            <VIcon icon="mdi-web" />
          </VAvatar>
        </template>
        <VListItemTitle>
          {{ target.name }}
        </VListItemTitle>
        <VListItemSubtitle class="mt-1 me-2">
          <div class="text-caption text-truncate text-disabled">{{ target.address }}</div>
          <div class="d-flex align-center mt-1">
            <VBadge dot location="start center" offset-x="2" :color="resolveStatusColor[target.status]" class="me-3">
              <span class="ms-4">{{ target.message }}</span>
            </VBadge>

            <span v-if="target.time" class="text-xs text-wrap text-disabled"> {{ target.time }} ms </span>
          </div>
        </VListItemSubtitle>
        <template #append>
          <VBtn size="small" icon="mdi-connection" :disabled="target.btndisable" @click="netTest(index)" />
        </template>
      </VListItem>
      <VDivider inset v-if="index !== targets.length - 1" />
    </template>
  </VList>
</template>
