<script lang="ts" setup>
import { vNativeCardMenu, nativeCardAction, type NativeCardMenuBinding } from '@/native/card'
import type { PropType } from 'vue'
import { getDisplayImageUrl, getLogoUrl } from '@/utils/imageUtils'
import { useGlobalSettingsStore } from '@/stores'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import { isApiBusinessFailure } from '@/api/client'
import type { Site, SiteStatistic, SiteUserData } from '@/api/types'
import { isNullOrEmptyObject } from '@/@core/utils'
import { formatFileSize } from '@/@core/utils/formatters'
import { useConfirm } from '@/composables/useConfirm'
import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { useDisplay } from 'vuetify'
import { openSharedDialog } from '@/composables/useSharedDialog'

const SiteAddEditDialog = defineAsyncComponent(() => import('../dialog/SiteAddEditDialog.vue'))
const SiteCookieUpdateDialog = defineAsyncComponent(() => import('../dialog/SiteCookieUpdateDialog.vue'))
const SiteResourceDialog = defineAsyncComponent(() => import('../dialog/SiteResourceDialog.vue'))
const SiteUserDataDialog = defineAsyncComponent(() => import('../dialog/SiteUserDataDialog.vue'))

// 显示器宽度
const display = useDisplay()

// 国际化
const { t } = useI18n()

// 输入参数
const cardProps = defineProps({
  site: Object as PropType<Site>,
  data: Object as PropType<SiteUserData>,
  stats: Object as PropType<SiteStatistic>,
  sortable: {
    type: Boolean,
    default: false,
  },
})
const globalSettingsStore = useGlobalSettingsStore()

// 定义触发的自定义事件
const emit = defineEmits(['update', 'remove', 'refresh-stats'])

// 确认框
const createConfirm = useConfirm()

// 图标
const defaultSiteIcon = getLogoUrl('site')
const siteIcon = ref<string>(defaultSiteIcon)

// 提示框
const $toast = useToast()

// 测试按钮文字
const testButtonText = ref(t('site.testConnectivity'))

// 测试按钮可用性
const testButtonDisable = ref(false)

// 更多操作菜单打开状态，菜单展开期间保持右侧悬浮操作胶囊可见
const isMenuOpen = ref(false)

// 查询站点图标
async function getSiteIcon() {
  const siteId = cardProps.site?.id
  if (!siteId) {
    siteIcon.value = defaultSiteIcon
    return
  }

  try {
    const icon = await getCachedSiteIcon(siteId, async () => {
      const response = await api.get<{ icon?: string }>(`site/icon/${siteId}`, { feedback: 'silent' })
      return response?.icon || defaultSiteIcon
    })
    siteIcon.value = getDisplayImageUrl(icon, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE)
  } catch (error) {
    siteIcon.value = defaultSiteIcon
    console.error(error)
  }
}

/** 展示后端实际检测范围，网页成功不能被改写成全部站点功能可用。 */
async function testSite() {
  try {
    testButtonText.value = t('site.testing')
    testButtonDisable.value = true

    await api.get(`site/test/${cardProps.site?.id}`, { feedback: 'all' })

    // 测试完成后刷新统计数据
    emit('refresh-stats', cardProps.site?.domain)
  } catch (error) {
    if (isApiBusinessFailure(error)) emit('refresh-stats', cardProps.site?.domain)
    console.error(error)
  } finally {
    testButtonText.value = t('site.testConnectivity')
    testButtonDisable.value = false
  }
}

// 打开更新站点Cookie UA弹窗
async function handleSiteUpdate() {
  openSharedDialog(
    SiteCookieUpdateDialog,
    { site: cardProps.site },
    {
      done: onSiteCookieUpdated,
    },
    { closeOn: ['close', 'done'] },
  )
}

// 打开资源浏览弹窗
async function handleResourceBrowse() {
  openSharedDialog(
    SiteResourceDialog,
    { site: cardProps.site },
    {
      close: onSiteResourceDone,
    },
    { closeOn: ['close'] },
  )
}

// 打开站点用户数据弹窗
async function handleSiteUserData() {
  openSharedDialog(SiteUserDataDialog, { site: cardProps.site }, {}, { closeOn: ['close'] })
}

// 打开站点编辑弹窗
function handleSiteEdit() {
  openSharedDialog(
    SiteAddEditDialog,
    { siteid: cardProps.site?.id },
    {
      save: saveSite,
      remove: () => emit('remove'),
    },
    { closeOn: ['close', 'save', 'remove'] },
  )
}

// 打开站点页面
function openSitePage() {
  window.open(cardProps.site?.url, '_blank')
}

function handleCardClick() {
  if (cardProps.sortable) {
    return
  }

  handleResourceBrowse()
}

function handleSiteUrlClick() {
  if (cardProps.sortable) {
    return
  }

  openSitePage()
}

// 调用API删除站点信息
async function deleteSiteInfo() {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('site.deleteConfirm'),
  })

  if (!isConfirmed) return

  try {
    await api.delete(`site/${cardProps.site?.id}`, { feedback: 'silent' })
    emit('remove')
  } catch (error) {
    $toast.error(t('site.deleteFailed', { name: cardProps.site?.name, message: error }))
    console.error(error)
  }
}

// 根据站点统计计算状态色阶
const statColor = computed(() => {
  if (!cardProps.stats || isNullOrEmptyObject(cardProps.stats)) {
    return 'secondary'
  }
  if (cardProps.stats?.lst_state === 1) {
    return 'error'
  } else if (cardProps.stats?.lst_state === 0) {
    if (!cardProps.stats?.seconds) return 'secondary'
    if (cardProps.stats?.seconds >= 5) return 'warning'
    return 'success'
  }
  return 'secondary'
})

// 仅在已测得结果时返回语义状态，正常站点保持静默，异常与较慢站点内联发声
const testResultType = computed<'error' | 'warning' | 'success' | ''>(() => {
  if (statColor.value === 'error' || statColor.value === 'warning' || statColor.value === 'success') {
    return statColor.value
  }
  return ''
})

// 连通性提示文案（避免使用冒号或分号）
const statButtonTipText = computed(() => {
  if (testButtonDisable.value) return t('site.testing')
  if (testResultType.value === 'error') return `${t('site.connectionFailed')} · ${t('site.testConnectivity')}`
  if (testResultType.value === 'warning') {
    const duration = cardProps.stats?.seconds ? ` ${cardProps.stats.seconds}s` : ''
    return `${t('site.connectionSlow')}${duration} · ${t('site.testConnectivity')}`
  }
  if (testResultType.value === 'success') {
    const duration = cardProps.stats?.seconds ? ` ${cardProps.stats.seconds}s` : ''
    return `${t('site.connectionNormal')}${duration} · ${t('site.testConnectivity')}`
  }
  return t('site.testConnectivity')
})

// 数据百分比计算
const getMaxDataValue = computed(() => {
  // 获取站点数据中的最大值作为基准
  const upload = cardProps.data?.upload || 0
  const download = cardProps.data?.download || 0

  // 避免两者都为0的情况
  if (upload === 0 && download === 0) return 1

  return Math.max(upload, download)
})

// 上传百分比
const getUploadPercent = computed(() => {
  const upload = cardProps.data?.upload || 0
  return Math.min(100, Math.max(3, (upload / getMaxDataValue.value) * 100))
})

// 下载百分比
const getDownloadPercent = computed(() => {
  const download = cardProps.data?.download || 0
  return Math.min(100, Math.max(3, (download / getMaxDataValue.value) * 100))
})

// 保存站点
function saveSite() {
  emit('update')
}

// 更新站点Cookie UA后的回调
function onSiteCookieUpdated() {
  // Cookie更新后刷新统计数据
  emit('refresh-stats', cardProps.site?.domain)
}

// 资源浏览弹窗关闭后的回调
function onSiteResourceDone() {
  // 资源操作完成后刷新统计数据
  emit('refresh-stats', cardProps.site?.domain)
}

/** 站点卡片只登记原更多菜单；测试、用户数据与更新按钮仍保留各自的独立功能。 */
const nativeCardMenu = computed<NativeCardMenuBinding>(() => ({
  key: cardProps.site?.id,
  title: cardProps.site?.name,
  available: () => !cardProps.sortable,
  items: () => [
    nativeCardAction('edit', {
      title: t('site.actions.edit'),
      icon: 'mdi-file-edit-outline',
      color: 'info',
      invoke: handleSiteEdit,
    }),
    nativeCardAction('delete', {
      title: t('site.deleteSite'),
      icon: 'mdi-delete-outline',
      color: 'error',
      invoke: deleteSiteInfo,
    }),
  ],
}))

// 装载时查询站点图标
onMounted(() => {
  getSiteIcon()
})
</script>

<template>
  <div>
    <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
    <div class="site-card-hover-area h-full">
      <VCard
        v-native-card-menu="nativeCardMenu"
        class="site-card app-hover-lift-card relative h-full flex flex-col overflow-hidden group"
        :class="[
          cardProps.site?.is_active ? '' : 'opacity-70',
          {
            'border-error': statColor === 'error',
            'border-warning': statColor === 'warning',
            'border-success': statColor === 'success',
            'cursor-pointer site-card--hoverable': !cardProps.sortable,
            'cursor-move': cardProps.sortable,
            'site-card--sortable': cardProps.sortable,
          },
        ]"
        :ripple="false"
        variant="flat"
        elevation="0"
        :hover="!cardProps.sortable"
        @click="handleCardClick"
      >
        <!-- 装饰性状态指示器 -->
        <div v-if="cardProps.site?.is_active" class="site-status-indicator" :class="statColor"></div>

        <!-- 主体部分保持对称内边距，默认态为完整无割裂的干净矩形 -->
        <div class="site-card__main relative z-1 flex flex-1 flex-col px-4 py-3.5">
          <div class="mb-1 flex min-w-0 items-center gap-2">
            <!-- 站点图标 -->
            <VAvatar
              tile
              rounded="lg"
              size="32"
              class="shrink-0"
              :class="{ 'cursor-move': cardProps.sortable && display.mdAndUp.value }"
            >
              <VImg :src="siteIcon" class="w-full h-full" :alt="cardProps.site?.name" cover>
                <template #placeholder>
                  <div class="w-full h-full">
                    <VSkeletonLoader class="object-cover aspect-square" />
                  </div>
                </template>
              </VImg>
            </VAvatar>

            <!-- 站点名称与特性图标（右侧为常驻呼吸状态灯珠预留热区） -->
            <div
              class="site-card__header-meta flex min-w-0 flex-1 items-center gap-1.5"
              :class="{ 'pe-7': !cardProps.sortable }"
            >
              <h3 class="site-card__title min-w-0 truncate">{{ cardProps.site?.name }}</h3>

              <!-- 站点特性图标 -->
              <div class="ml-auto flex shrink-0 items-center gap-2">
                <div
                  v-if="cardProps.site?.limit_interval"
                  :class="cardProps.sortable ? '' : 'hover:bg-primary/8 transition-colors'"
                >
                  <VIcon
                    icon="mdi-speedometer"
                    size="16"
                    color="primary"
                    :class="cardProps.sortable ? 'opacity-85' : 'opacity-85 hover:opacity-100'"
                  />
                </div>
                <div
                  v-if="cardProps.site?.proxy"
                  :class="cardProps.sortable ? '' : 'hover:bg-primary/8 transition-colors'"
                >
                  <VIcon
                    icon="mdi-network-outline"
                    size="16"
                    color="primary"
                    :class="cardProps.sortable ? 'opacity-85' : 'opacity-85 hover:opacity-100'"
                  />
                </div>
                <div
                  v-if="cardProps.site?.render"
                  :class="cardProps.sortable ? '' : 'hover:bg-primary/8 transition-colors'"
                >
                  <VIcon
                    icon="mdi-apple-safari"
                    size="16"
                    color="primary"
                    :class="cardProps.sortable ? 'opacity-85' : 'opacity-85 hover:opacity-100'"
                  />
                </div>
                <div
                  v-if="cardProps.site?.filter"
                  :class="cardProps.sortable ? '' : 'hover:bg-primary/8 transition-colors'"
                >
                  <VIcon
                    icon="mdi-filter-cog-outline"
                    size="16"
                    color="primary"
                    :class="cardProps.sortable ? 'opacity-85' : 'opacity-85 hover:opacity-100'"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 中间部分网址 -->
          <div class="my-2.5">
            <div class="site-card__url min-w-0 truncate" @click.stop="handleSiteUrlClick">
              {{ cardProps.site?.url }}
            </div>
          </div>

          <!-- 底部数据统计双列网格对齐上传与下载进度条起点 -->
          <div class="flex-1 flex flex-col justify-end">
            <div class="site-card__stats">
              <!-- 上传数据 -->
              <div class="site-card__stat-value num">
                <VIcon icon="mdi-arrow-up" size="14" color="info" />
                <span>{{ formatFileSize(cardProps.data?.upload || 0) }}</span>
              </div>
              <div class="site-card__stat-track">
                <VProgressLinear :model-value="getUploadPercent" color="info" height="4" rounded="lg" />
              </div>

              <!-- 下载数据 -->
              <div class="site-card__stat-value num">
                <VIcon icon="mdi-arrow-down" size="14" color="success" />
                <span>{{ formatFileSize(cardProps.data?.download || 0) }}</span>
              </div>
              <div class="site-card__stat-track">
                <VProgressLinear :model-value="getDownloadPercent" color="success" height="4" rounded="lg" />
              </div>
            </div>
          </div>
        </div>

        <!-- 右上角常驻呼吸状态灯珠；悬停、聚焦或菜单展开时同坐标向下平滑浮现完整操作栏 -->
        <div v-if="!cardProps.sortable" class="site-card-actions" :class="{ 'site-card-actions--visible': isMenuOpen }">
          <!-- 连通性呼吸灯珠按钮（常态可见，位置固定零跳变） -->
          <VBtn
            icon
            variant="text"
            class="site-card-actions__btn site-card-actions__test"
            :disabled="testButtonDisable"
            :aria-label="testButtonText"
            :title="statButtonTipText"
            size="28"
            @click.stop="testSite"
          >
            <div v-if="testButtonDisable" class="relative w-4 h-4">
              <div class="spinner-circle" />
            </div>
            <div v-else class="site-card__pulse-wrap">
              <div class="pulse-dot" :class="statColor" />
            </div>
          </VBtn>

          <!-- 用户数据按钮 -->
          <VBtn
            icon
            variant="text"
            class="site-card-actions__btn site-card-actions__reveal"
            size="28"
            :aria-label="t('site.viewUserData')"
            :title="t('site.viewUserData')"
            @click.stop="handleSiteUserData"
          >
            <VIcon icon="mdi-chart-bell-curve" size="17" />
          </VBtn>

          <!-- 更新按钮 -->
          <VBtn
            icon
            variant="text"
            class="site-card-actions__btn site-card-actions__reveal"
            size="28"
            :aria-label="t('site.updateCookie')"
            :title="t('site.updateCookie')"
            @click.stop="handleSiteUpdate"
          >
            <VIcon icon="mdi-refresh" size="17" />
          </VBtn>

          <!-- 更多选项按钮 -->
          <VBtn
            data-native-card-menu-trigger
            icon
            variant="text"
            class="site-card-actions__btn site-card-actions__reveal mt-auto"
            size="28"
            :aria-label="t('nav.more')"
            @click.stop
          >
            <VIcon icon="mdi-dots-vertical" size="17" />
            <VMenu v-model="isMenuOpen" activator="parent" :close-on-content-click="true" location="left">
              <VList>
                <template v-if="display.xs.value">
                  <VListItem :disabled="testButtonDisable" @click="testSite">
                    <template #prepend>
                      <VIcon icon="mdi-lan-connect" size="20" />
                    </template>
                    <VListItemTitle>{{ testButtonText }}</VListItemTitle>
                  </VListItem>
                  <VListItem @click="handleSiteUserData">
                    <template #prepend>
                      <VIcon icon="mdi-chart-bell-curve" size="20" />
                    </template>
                    <VListItemTitle>{{ t('site.viewUserData') }}</VListItemTitle>
                  </VListItem>
                  <VListItem @click="handleSiteUpdate">
                    <template #prepend>
                      <VIcon icon="mdi-refresh" size="20" />
                    </template>
                    <VListItemTitle>{{ t('site.updateCookie') }}</VListItemTitle>
                  </VListItem>
                </template>
                <VListItem base-color="info" @click="handleSiteEdit">
                  <template #prepend>
                    <VIcon icon="mdi-file-edit-outline" size="20" />
                  </template>
                  <VListItemTitle>{{ t('site.actions.edit') }}</VListItemTitle>
                </VListItem>
                <VListItem @click="deleteSiteInfo">
                  <template #prepend>
                    <VIcon icon="mdi-delete-outline" size="20" color="error" />
                  </template>
                  <VListItemTitle class="text-error">{{ t('site.deleteSite') }}</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </VBtn>
        </div>
      </VCard>
    </div>
  </div>
</template>

<style scoped>
.site-card-hover-area {
  inline-size: 100%;
}

.site-card-hover-area:hover .site-card--hoverable {
  transform: translate3d(0, -0.25rem, 0);
}

.site-card__title {
  color: var(--mp-fg);
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.35;
}

.site-card__pulse-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  block-size: 1rem;
  inline-size: 1rem;
}

.pulse-dot {
  position: relative;
  border-radius: 50%;
  block-size: 0.875rem;
  box-shadow: inset 0 0 0 1.5px rgba(var(--v-theme-on-surface), 0.1);
  inline-size: 0.875rem;
}

.pulse-dot::before {
  position: absolute;
  z-index: 1;
  border-radius: 50%;
  block-size: 64%;
  content: '';
  inline-size: 64%;
  inset-block-start: 18%;
  inset-inline-start: 18%;
}

.pulse-dot::after {
  position: absolute;
  z-index: 2;
  border-radius: 50%;
  block-size: 100%;
  content: '';
  inline-size: 100%;
  inset: 0;
}

.pulse-dot.error::before {
  background-color: rgba(var(--v-theme-error), 1);
  box-shadow: 0 0 10px rgba(var(--v-theme-error), 0.85);
}

.pulse-dot.error::after {
  animation: pulse-animation-error 2s infinite;
  box-shadow: 0 0 0 2px rgba(var(--v-theme-error), 0.32);
}

.pulse-dot.warning::before {
  background-color: rgba(var(--v-theme-warning), 1);
  box-shadow: 0 0 10px rgba(var(--v-theme-warning), 0.85);
}

.pulse-dot.warning::after {
  animation: pulse-animation-warning 2s infinite;
  box-shadow: 0 0 0 2px rgba(var(--v-theme-warning), 0.32);
}

.pulse-dot.success::before {
  background-color: rgba(var(--v-theme-success), 1);
  box-shadow: 0 0 8px rgba(var(--v-theme-success), 0.72);
}

.pulse-dot.success::after {
  animation: pulse-animation-success 2.4s infinite;
  box-shadow: 0 0 0 2px rgba(var(--v-theme-success), 0.26);
}

.pulse-dot.secondary::before {
  background-color: rgba(var(--v-theme-secondary), 0.85);
  box-shadow: 0 0 6px rgba(var(--v-theme-secondary), 0.5);
}

.pulse-dot.secondary::after {
  box-shadow: 0 0 0 1.5px rgba(var(--v-theme-secondary), 0.24);
}

.spinner-circle {
  position: absolute;
  border: 1.5px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 50%;
  animation: site-spin 0.8s linear infinite;
  block-size: 100%;
  border-block-start-color: rgba(var(--v-theme-primary), 1);
  inline-size: 100%;
}

@keyframes pulse-animation-error {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-error), 0.58);
  }

  70% {
    box-shadow: 0 0 0 8px rgba(var(--v-theme-error), 0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-error), 0);
  }
}

@keyframes pulse-animation-warning {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-warning), 0.58);
  }

  70% {
    box-shadow: 0 0 0 8px rgba(var(--v-theme-warning), 0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-warning), 0);
  }
}

@keyframes pulse-animation-success {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-success), 0.48);
  }

  70% {
    box-shadow: 0 0 0 7px rgba(var(--v-theme-success), 0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-success), 0);
  }
}

@keyframes site-spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}
.site-card__url {
  color: var(--mp-muted-fg);
  font-size: 0.8125rem;
  line-height: 1.4;
  transition: color 0.16s ease;
}

.site-card--hoverable .site-card__url:hover {
  color: var(--mp-fg);
}

.site-card__stats {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  border-block-start: 1px solid var(--mp-border-subtle);
  column-gap: 0.75rem;
  margin-block-start: 0.375rem;
  padding-block-start: 0.5rem;
  row-gap: 0.375rem;
}

.site-card__stat-value {
  display: inline-flex;
  align-items: center;
  color: var(--mp-fg);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  gap: 0.25rem;
  line-height: 1.25;
  white-space: nowrap;
}

.site-card__stat-track {
  position: relative;
  overflow: hidden;
  border-radius: 9999px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  block-size: 0.25rem;
  min-inline-size: 0;
}

.site-status-indicator {
  position: absolute;
  z-index: 1;
  block-size: 2px;
  inset-block-start: 0;
  inset-inline: 0;
  opacity: 0.5;
  transition:
    block-size 0.3s ease,
    opacity 0.3s ease;
}

.site-status-indicator.error {
  background: linear-gradient(90deg, transparent, rgba(var(--v-theme-error), 0.7), transparent);
  box-shadow: 0 0 8px rgba(var(--v-theme-error), 0.3);
}

.site-status-indicator.warning {
  background: linear-gradient(90deg, transparent, rgba(var(--v-theme-warning), 0.7), transparent);
  box-shadow: 0 0 8px rgba(var(--v-theme-warning), 0.3);
}

.site-status-indicator.success {
  background: linear-gradient(90deg, transparent, rgba(var(--v-theme-success), 0.7), transparent);
  box-shadow: 0 0 8px rgba(var(--v-theme-success), 0.3);
}

.site-status-indicator.secondary {
  background: linear-gradient(90deg, transparent, rgba(var(--v-theme-secondary), 0.7), transparent);
  box-shadow: 0 0 8px rgba(var(--v-theme-secondary), 0.3);
}

/* 站点卡片悬停时状态指示器变化 */
.site-card-hover-area:hover .site-card:not(.site-card--sortable) .site-status-indicator {
  block-size: 2px;
  opacity: 0.8;
}

.site-card-actions {
  position: absolute;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  border: 1px solid transparent;
  border-radius: calc(var(--app-control-radius, 12px) * 0.85);
  background: transparent;
  box-shadow: none;
  gap: 0.125rem;
  inline-size: 2.25rem;
  inset-block: 0.375rem;
  inset-inline-end: 0.375rem;
  padding-block: 0.25rem;
  pointer-events: none;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.site-card-actions__test {
  pointer-events: auto;
}

.site-card-actions__reveal {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.site-card-hover-area:hover .site-card-actions,
.site-card:focus-within .site-card-actions,
.site-card-actions.site-card-actions--visible {
  border-color: var(--mp-border);
  background: rgba(var(--mp-popover-rgb, 255, 255, 255), 0.94);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.14);
  pointer-events: auto;
}

.site-card-hover-area:hover .site-card-actions__reveal,
.site-card:focus-within .site-card-actions__reveal,
.site-card-actions.site-card-actions--visible .site-card-actions__reveal {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
.site-card-actions__btn {
  color: var(--mp-muted-fg);
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.site-card-actions__btn:hover,
.site-card-actions__btn:focus-visible {
  color: var(--mp-fg);
}

@media (hover: none) {
  .site-card__header-meta.pe-7 {
    padding-inline-end: 3.75rem !important;
  }

  .site-card-actions {
    flex-direction: row;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    gap: 0.125rem;
    inline-size: auto;
    inset-block: 0.375rem auto;
    padding-block: 0;
    pointer-events: auto;
    transform: none;
    visibility: visible;
  }

  .site-card-actions > :not(.site-card-actions__test, [data-native-card-menu-trigger]) {
    display: none;
  }

  .site-card-actions [data-native-card-menu-trigger] {
    margin-block-start: 0 !important;
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }
}
</style>
