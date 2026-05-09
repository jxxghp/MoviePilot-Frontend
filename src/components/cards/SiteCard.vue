<script lang="ts" setup>
import type { PropType } from 'vue'
import { getLogoUrl } from '@/utils/imageUtils'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import SiteAddEditDialog from '../dialog/SiteAddEditDialog.vue'
import SiteUserDataDialog from '../dialog/SiteUserDataDialog.vue'
import SiteResourceDialog from '../dialog/SiteResourceDialog.vue'
import SiteCookieUpdateDialog from '../dialog/SiteCookieUpdateDialog.vue'
import api from '@/api'
import type { Site, SiteStatistic, SiteUserData } from '@/api/types'
import { isNullOrEmptyObject } from '@/@core/utils'
import { formatFileSize } from '@/@core/utils/formatters'
import { useConfirm } from '@/composables/useConfirm'
import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { useDisplay } from 'vuetify'

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

// 更新站点Cookie UA弹窗
const siteCookieDialog = ref(false)

// 站点编辑弹窗
const siteEditDialog = ref(false)

// 资源浏览弹窗
const resourceDialog = ref(false)

// 用户数据弹窗
const siteUserDataDialog = ref(false)

// 查询站点图标
async function getSiteIcon() {
  const siteId = cardProps.site?.id
  if (!siteId) {
    siteIcon.value = defaultSiteIcon
    return
  }

  try {
    siteIcon.value = await getCachedSiteIcon(siteId, async () => {
      const response = await api.get(`site/icon/${siteId}`)

      return response?.data?.icon || defaultSiteIcon
    })
  } catch (error) {
    siteIcon.value = defaultSiteIcon
    console.error(error)
  }
}

// 测试站点连通性
async function testSite() {
  try {
    testButtonText.value = t('site.testing')
    testButtonDisable.value = true

    const result: { [key: string]: any } = await api.get(`site/test/${cardProps.site?.id}`)
    if (result.success) $toast.success(t('site.testSuccess', { name: cardProps.site?.name }))
    else $toast.error(t('site.testFailed', { name: cardProps.site?.name, message: result.message }))

    testButtonText.value = t('site.testConnectivity')
    testButtonDisable.value = false

    // 测试完成后刷新统计数据
    emit('refresh-stats', cardProps.site?.domain)
  } catch (error) {
    console.error(error)
  }
}

// 打开更新站点Cookie UA弹窗
async function handleSiteUpdate() {
  siteCookieDialog.value = true
}

// 打开资源浏览弹窗
async function handleResourceBrowse() {
  resourceDialog.value = true
}

// 打开站点用户数据弹窗
async function handleSiteUserData() {
  siteUserDataDialog.value = true
}

// 打开站点页面
function openSitePage() {
  window.open(cardProps.site?.url, '_blank')
}

// 调用API删除站点信息
async function deleteSiteInfo() {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('site.deleteConfirm'),
  })

  if (!isConfirmed) return

  try {
    const result: { [key: string]: any } = await api.delete(`site/${cardProps.site?.id}`)
    if (result.success) emit('remove')
    else $toast.error(t('site.deleteFailed', { name: cardProps.site?.name, message: result.message }))
  } catch (error) {
    $toast.error(t('site.deleteFailed', { name: cardProps.site?.name, message: error }))
    console.error(error)
  }
}

// 根据站点状态显示不同的状态图标
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
  siteEditDialog.value = false
  emit('update')
}

// 更新站点Cookie UA后的回调
function onSiteCookieUpdated() {
  siteCookieDialog.value = false
  // Cookie更新后刷新统计数据
  emit('refresh-stats', cardProps.site?.domain)
}

// 资源浏览弹窗关闭后的回调
function onSiteResourceDone() {
  resourceDialog.value = false
  // 资源操作完成后刷新统计数据
  emit('refresh-stats', cardProps.site?.domain)
}

// 装载时查询站点图标
onMounted(() => {
  getSiteIcon()
})
</script>

<template>
  <div>
    <VCard
      class="site-card relative h-full flex flex-col overflow-hidden group transition-all duration-300 cursor-pointer hover:-translate-y-1"
      :class="[
        cardProps.site?.is_active ? '' : 'opacity-70',
        {
          'border-error': statColor === 'error',
          'border-warning': statColor === 'warning',
          'border-success': statColor === 'success',
        },
      ]"
      :ripple="false"
      variant="flat"
      elevation="0"
      rounded="lg"
      hover
      @click="handleResourceBrowse"
    >
      <!-- 装饰性状态指示器 -->
      <div v-if="cardProps.site?.is_active" class="site-status-indicator" :class="statColor"></div>

      <!-- 主体部分 -->
      <div class="relative z-1 flex flex-1 flex-col p-3 pr-12">
        <!-- 顶部：图标和站点名称 -->
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

          <!-- 站点名称和特性图标 -->
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <h3 class="min-w-0 flex-1 truncate text-lg font-semibold leading-tight">{{ cardProps.site?.name }}</h3>

            <!-- 站点特性图标 -->
            <div class="ml-auto flex shrink-0 items-center gap-2">
              <div v-if="cardProps.site?.limit_interval" class="hover:bg-primary/8 transition-colors">
                <VIcon icon="mdi-speedometer" size="16" color="primary" class="opacity-85 hover:opacity-100" />
              </div>
              <div v-if="cardProps.site?.proxy" class="hover:bg-primary/8 transition-colors">
                <VIcon icon="mdi-network-outline" size="16" color="primary" class="opacity-85 hover:opacity-100" />
              </div>
              <div v-if="cardProps.site?.render" class="hover:bg-primary/8 transition-colors">
                <VIcon icon="mdi-apple-safari" size="16" color="primary" class="opacity-85 hover:opacity-100" />
              </div>
              <div v-if="cardProps.site?.filter" class="hover:bg-primary/8 transition-colors">
                <VIcon icon="mdi-filter-cog-outline" size="16" color="primary" class="opacity-85 hover:opacity-100" />
              </div>
            </div>
          </div>
        </div>

        <!-- 中间部分：网址 -->
        <div class="my-3">
          <div class="min-w-0 truncate text-sm text-medium-emphasis" @click.stop="openSitePage">
            {{ cardProps.site?.url }}
          </div>
        </div>

        <!-- 底部：数据统计 -->
        <div class="flex-1 flex flex-col justify-end">
          <!-- 更直观的上传下载数据条 -->
          <div class="border-t mt-1.5 pt-1.5">
            <!-- 上传数据 -->
            <div class="flex items-center justify-between gap-3 mb-1.5">
              <div class="text-sm text-medium-emphasis min-w-[70px]">
                <VIcon icon="mdi-arrow-up" size="14" color="info" class="mr-1" />
                <span>{{ formatFileSize(cardProps.data?.upload || 0) }}</span>
              </div>
              <div class="flex-grow h-1 rounded bg-on-surface/8 relative overflow-hidden">
                <VProgressLinear :model-value="getUploadPercent" color="info" height="4" rounded="lg" />
              </div>
            </div>

            <!-- 下载数据 -->
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center text-[0.8rem] text-medium-emphasis min-w-[70px]">
                <VIcon icon="mdi-arrow-down" size="14" color="success" class="mr-1" />
                <span>{{ formatFileSize(cardProps.data?.download || 0) }}</span>
              </div>
              <div class="flex-grow h-1 rounded bg-on-surface/8 relative overflow-hidden">
                <VProgressLinear :model-value="getDownloadPercent" color="warning" height="4" rounded="lg" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧操作按钮区 -->
      <VSheet class="site-card-actions absolute inset-y-0 right-0 z-20 flex flex-col py-2 px-1">
        <!-- 测试按钮 -->
        <VBtn
          icon
          variant="text"
          density="comfortable"
          class="mb-1 relative flex items-center justify-center rounded-full mx-auto"
          :disabled="testButtonDisable"
          @click.stop="testSite"
          size="36"
        >
          <div class="relative flex items-center justify-center w-full h-full">
            <div
              class="w-[20px] h-[20px] rounded-full shadow-[inset_0_0_0_2px_rgba(var(--v-theme-on-surface),0.1)] pulse-dot"
              :class="statColor"
            ></div>
          </div>
          <div
            v-if="testButtonDisable"
            class="absolute inset-0 flex flex-col items-center justify-center bg-surface/95 rounded-full shadow-md animate-fade-in"
          >
            <div class="relative w-6 h-6">
              <div class="spinner-circle"></div>
            </div>
          </div>
        </VBtn>

        <!-- 用户数据按钮 -->
        <VBtn icon variant="text" @click.stop="handleSiteUserData" size="36">
          <VIcon icon="mdi-chart-bell-curve" size="20" />
        </VBtn>

        <!-- 更新按钮 -->
        <VBtn icon variant="text" @click.stop="handleSiteUpdate" size="36">
          <VIcon icon="mdi-refresh" size="20" />
        </VBtn>

        <!-- 更多选项按钮 -->
        <VBtn icon variant="text" class="mt-auto" size="36">
          <VIcon icon="mdi-dots-vertical" size="20" />
          <VMenu :activator="'parent'" :close-on-content-click="true" :location="'left'">
            <VList>
              <VListItem @click="siteEditDialog = true" base-color="info">
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
      </VSheet>
    </VCard>

    <!-- 对话框组件 -->
    <SiteCookieUpdateDialog
      v-if="siteCookieDialog"
      v-model="siteCookieDialog"
      :site="cardProps.site"
      @close="siteCookieDialog = false"
      @done="onSiteCookieUpdated"
    />
    <SiteAddEditDialog
      v-if="siteEditDialog"
      v-model="siteEditDialog"
      :siteid="cardProps.site?.id"
      @save="saveSite"
      @remove="emit('remove')"
      @close="siteEditDialog = false"
    />
    <SiteUserDataDialog
      v-if="siteUserDataDialog"
      v-model="siteUserDataDialog"
      :site="cardProps.site"
      @close="siteUserDataDialog = false"
    />
    <SiteResourceDialog
      v-if="resourceDialog"
      v-model="resourceDialog"
      :site="cardProps.site"
      @close="onSiteResourceDone"
    />
  </div>
</template>

<style scoped>
.site-status-indicator {
  position: absolute;
  z-index: 1;
  block-size: 2px;
  inset-block-start: 0;
  inset-inline: 0;
  opacity: 0.5;
  transition: block-size 0.3s ease, opacity 0.3s ease;
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
.site-card:hover .site-status-indicator {
  block-size: 2px;
  opacity: 0.8;
}

/* 上传下载条样式 */
.upload-bar {
  animation: pulse-width 2s infinite;
  background: linear-gradient(90deg, #4d79ff, #07f);
  box-shadow: 0 0 4px rgba(0, 119, 255, 50%);
}

.download-bar {
  animation: pulse-width 2s infinite;
  background: linear-gradient(90deg, #42d392, #00b77e);
  box-shadow: 0 0 4px rgba(0, 183, 126, 50%);
}

/* 测试状态点样式 */
.pulse-dot::before {
  position: absolute;
  z-index: 1;
  border-radius: 50%;
  block-size: 70%;
  content: '';
  inline-size: 70%;
  inset-block-start: 15%;
  inset-inline-start: 15%;
}

.pulse-dot::after {
  position: absolute;
  z-index: 2;
  border-radius: 50%;
  block-size: 100%;
  content: '';
  inline-size: 100%;
  inset-block-start: 0;
  inset-inline-start: 0;
}

.pulse-dot.error::before {
  background-color: rgba(var(--v-theme-error), 1);
  box-shadow: 0 0 10px rgba(var(--v-theme-error), 0.8);
}

.pulse-dot.error::after {
  animation: pulse-animation-error 2s infinite;
  box-shadow: 0 0 0 2px rgba(var(--v-theme-error), 0.3);
}

.pulse-dot.warning::before {
  background-color: rgba(var(--v-theme-warning), 1);
  box-shadow: 0 0 10px rgba(var(--v-theme-warning), 0.8);
}

.pulse-dot.warning::after {
  animation: pulse-animation-warning 2s infinite;
  box-shadow: 0 0 0 2px rgba(var(--v-theme-warning), 0.3);
}

.pulse-dot.success::before {
  background-color: rgba(var(--v-theme-success), 1);
  box-shadow: 0 0 10px rgba(var(--v-theme-success), 0.8);
}

.pulse-dot.success::after {
  animation: pulse-animation-success 2s infinite;
  box-shadow: 0 0 0 2px rgba(var(--v-theme-success), 0.3);
}

.pulse-dot.secondary::before {
  background-color: rgba(var(--v-theme-secondary), 1);
  box-shadow: 0 0 10px rgba(var(--v-theme-secondary), 0.8);
}

.pulse-dot.secondary::after {
  animation: pulse-animation-secondary 2s infinite;
  box-shadow: 0 0 0 2px rgba(var(--v-theme-secondary), 0.3);
}

/* 加载动画 */
.spinner-circle {
  position: absolute;
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  block-size: 100%;
  border-block-start-color: rgba(var(--v-theme-primary), 1);
  inline-size: 100%;
}

/* 动画关键帧 */
@keyframes pulse-width {
  0%,
  100% {
    opacity: 0.85;
    transform: scaleX(0.95);
  }

  50% {
    opacity: 1;
    transform: scaleX(1.05);
  }
}

@keyframes pulse-animation-error {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-error), 0.6);
  }

  70% {
    box-shadow: 0 0 0 10px rgba(var(--v-theme-error), 0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-error), 0);
  }
}

@keyframes pulse-animation-warning {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-warning), 0.6);
  }

  70% {
    box-shadow: 0 0 0 10px rgba(var(--v-theme-warning), 0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-warning), 0);
  }
}

@keyframes pulse-animation-success {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-success), 0.6);
  }

  70% {
    box-shadow: 0 0 0 10px rgba(var(--v-theme-success), 0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-success), 0);
  }
}

@keyframes pulse-animation-secondary {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-secondary), 0.6);
  }

  70% {
    box-shadow: 0 0 0 10px rgba(var(--v-theme-secondary), 0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-secondary), 0);
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.site-card-actions {
  opacity: 0;
  transform: translateX(100%);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  visibility: hidden;
}

.site-card:hover .site-card-actions {
  opacity: 1;
  transform: translateX(0);
  visibility: visible;
}
</style>
