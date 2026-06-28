<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { ScheduleInfo } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useBackground } from '@/composables/useBackground'

// 移动端任务卡片视觉配置。
type SchedulerMobileVisual = {
  color: string
  icon: string
  rgb: string
}

// 已知定时服务的移动端视觉配置。
type SchedulerMobileVisualRule = SchedulerMobileVisual & {
  ids?: string[]
  names?: string[]
  providers?: string[]
}

// 国际化
const { t } = useI18n()
const { useDataRefresh } = useBackground()

// 提示框
const $toast = useToast()

// 定时服务列表
const schedulerList = ref<ScheduleInfo[]>([])

// 移动端任务图标按后端 job id 优先匹配，避免列表顺序变化导致图标看起来随机。
const schedulerMobileVisualRules: SchedulerMobileVisualRule[] = [
  { ids: ['cookiecloud'], names: ['CookieCloud'], icon: 'mdi-cloud-sync-outline', color: '#3f8cff', rgb: '63, 140, 255' },
  { ids: ['mediaserver_sync'], names: ['媒体服务器'], icon: 'mdi-television-play', color: '#42c336', rgb: '66, 195, 54' },
  { ids: ['new_subscribe_search', 'subscribe_search'], names: ['订阅搜索', '新增订阅搜索'], icon: 'mdi-magnify', color: '#e91e63', rgb: '233, 30, 99' },
  { ids: ['subscribe_tmdb'], names: ['订阅元数据'], icon: 'mdi-database-search-outline', color: '#9b6cf3', rgb: '155, 108, 243' },
  { ids: ['subscribe_refresh'], names: ['订阅刷新'], icon: 'mdi-refresh', color: '#25b6c8', rgb: '37, 182, 200' },
  { ids: ['subscribe_follow'], names: ['订阅分享'], icon: 'mdi-share-variant-outline', color: '#ff704d', rgb: '255, 112, 77' },
  { ids: ['transfer'], names: ['下载文件整理', '文件整理'], icon: 'mdi-folder-move-outline', color: '#3f8cff', rgb: '63, 140, 255' },
  { ids: ['random_wallpager'], names: ['壁纸'], icon: 'mdi-image-outline', color: '#9b6cf3', rgb: '155, 108, 243' },
  { ids: ['scheduler_job'], names: ['公共定时服务'], icon: 'mdi-clock-outline', color: '#42c336', rgb: '66, 195, 54' },
  { ids: ['clear_cache'], names: ['缓存清理'], icon: 'mdi-delete-sweep-outline', color: '#ffad1f', rgb: '255, 173, 31' },
  { ids: ['data_cleanup'], names: ['数据表清理'], icon: 'mdi-database-remove-outline', color: '#ff704d', rgb: '255, 112, 77' },
  { ids: ['user_auth'], names: ['用户认证'], icon: 'mdi-account-check-outline', color: '#9b6cf3', rgb: '155, 108, 243' },
  { ids: ['sitedata_refresh'], names: ['站点数据'], icon: 'mdi-web-refresh', color: '#25b6c8', rgb: '37, 182, 200' },
  { ids: ['recommend_refresh'], names: ['推荐缓存'], icon: 'mdi-star-outline', color: '#ffad1f', rgb: '255, 173, 31' },
  { ids: ['plugin_market_refresh'], names: ['插件市场'], icon: 'mdi-puzzle-outline', color: '#ff704d', rgb: '255, 112, 77' },
  { ids: ['subscribe_calendar_cache'], names: ['订阅日历'], icon: 'mdi-calendar-refresh-outline', color: '#3f8cff', rgb: '63, 140, 255' },
  { ids: ['full_gc'], names: ['内存回收'], icon: 'mdi-memory', color: '#25b6c8', rgb: '37, 182, 200' },
  { ids: ['agent_heartbeat'], names: ['智能体'], icon: 'mdi-robot-outline', color: '#9b6cf3', rgb: '155, 108, 243' },
  { ids: ['usage_report'], names: ['统计上报'], icon: 'mdi-chart-line', color: '#42c336', rgb: '66, 195, 54' },
  { ids: ['workflow'], providers: ['工作流'], icon: 'mdi-source-branch', color: '#3f8cff', rgb: '63, 140, 255' },
  { ids: ['plugin'], icon: 'mdi-puzzle-outline', color: '#ff704d', rgb: '255, 112, 77' },
]

// 未知服务使用固定兜底视觉，避免用户误以为图标按列表顺序乱跳。
const schedulerMobileFallbackVisual: SchedulerMobileVisual = {
  icon: 'mdi-timer-cog-outline',
  color: '#25b6c8',
  rgb: '37, 182, 200',
}

/** 调用 API 加载定时服务列表。 */
async function loadSchedulerList() {
  try {
    const res: ScheduleInfo[] = await api.get('dashboard/schedule')

    schedulerList.value = Array.isArray(res) ? res : []
  } catch (e) {
    console.log(e)
  }
}

/** 根据任务状态返回桌面端状态标签颜色。 */
function getSchedulerColor(status: string) {
  switch (status) {
    case t('setting.scheduler.running'):
      return 'success'
    case t('setting.scheduler.stopped'):
      return 'error'
    case t('setting.scheduler.waiting'):
      return ''
    default:
      return ''
  }
}

/** 根据任务状态返回移动端状态胶囊的语义样式。 */
function getSchedulerStatusVariant(status: string) {
  switch (status) {
    case t('setting.scheduler.running'):
      return 'running'
    case t('setting.scheduler.stopped'):
      return 'stopped'
    case t('setting.scheduler.waiting'):
      return 'waiting'
    default:
      return 'default'
  }
}

/** 判断规则列表是否命中指定文本。 */
function hasSchedulerRuleMatch(values: string[] | undefined, target: string) {
  if (!values?.length) return false

  return values.some(value => target.includes(value.toLocaleLowerCase()))
}

/** 使用后端 job id、服务名和提供者为移动端任务卡片选择图标和主题色。 */
function getMobileSchedulerVisual(scheduler: ScheduleInfo): SchedulerMobileVisual {
  const schedulerId = (scheduler.id || '').toLocaleLowerCase()
  const schedulerName = (scheduler.name || '').toLocaleLowerCase()
  const schedulerProvider = (scheduler.provider || '').toLocaleLowerCase()
  const matchedRule = schedulerMobileVisualRules.find(rule => {
    const matchedId = hasSchedulerRuleMatch(rule.ids, schedulerId)
    const matchedName = hasSchedulerRuleMatch(rule.names, schedulerName)
    const matchedProvider = hasSchedulerRuleMatch(rule.providers, schedulerProvider)

    return matchedId || matchedName || matchedProvider
  })

  return matchedRule ?? schedulerMobileFallbackVisual
}

/** 将后端返回的紧凑时间差转换为更适合移动端展示的文本。 */
function formatMobileNextRunTime(nextRun?: string) {
  return nextRun?.trim() || ''
}

/** 获取移动端状态胶囊文案；等待状态展示为下次运行倒计时。 */
function getMobileSchedulerStatusText(scheduler: ScheduleInfo) {
  if (scheduler.status === t('setting.scheduler.waiting')) {
    const readableNextRun = formatMobileNextRunTime(scheduler.next_run)

    return readableNextRun
      ? t('setting.scheduler.mobileWaitingAfter', { time: readableNextRun })
      : t('setting.scheduler.mobileNoNextRun')
  }

  return scheduler.status
}

/** 执行指定定时服务，并在短延迟后刷新列表。 */
function runCommand(id: string) {
  try {
    // 异步提交
    api.get('system/runscheduler', {
      params: {
        jobid: id,
      },
    })
    $toast.success(t('setting.scheduler.executeSuccess'))
    // 1秒后刷新数据
    setTimeout(() => {
      loadSchedulerList()
    }, 1000)
  } catch (e) {
    console.log(e)
  }
}

// 移动端任务卡片展示模型。
const mobileSchedulerCards = computed(() =>
  schedulerList.value.map(scheduler => ({
    scheduler,
    statusText: getMobileSchedulerStatusText(scheduler),
    statusVariant: getSchedulerStatusVariant(scheduler.status),
    visual: getMobileSchedulerVisual(scheduler),
  })),
)

// 使用数据刷新定时器
const { loading: schedulerLoading } = useDataRefresh(
  'scheduler-list',
  loadSchedulerList,
  5000, // 5秒间隔
  true // 立即执行
)
</script>

<template>
  <VCard class="d-none d-md-block">
    <VTable v-if="schedulerList.length" class="text-no-wrap">
      <thead>
        <tr>
          <th scope="col">{{ t('setting.scheduler.provider') }}</th>
          <th scope="col">{{ t('setting.scheduler.taskName') }}</th>
          <th scope="col">{{ t('setting.scheduler.taskStatus') }}</th>
          <th scope="col">{{ t('setting.scheduler.nextRunTime') }}</th>
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
            <VBtn
              size="small"
              :disabled="scheduler.status === t('setting.scheduler.running')"
              @click="runCommand(scheduler.id)"
            >
              <template #prepend>
                <VIcon>mdi-play</VIcon>
              </template>
              {{ t('setting.scheduler.execute') }}
            </VBtn>
          </td>
        </tr>
      </tbody>
    </VTable>

    <div v-else-if="!schedulerLoading" class="desktop-scheduler-empty">
      <VIcon icon="mdi-timer-off-outline" size="48" />
      <p>{{ t('setting.scheduler.noService') }}</p>
    </div>

    <div v-else class="desktop-scheduler-empty">
      <VProgressCircular indeterminate color="primary" size="22" width="2" />
      <p>{{ t('common.loadingText') }}</p>
    </div>
  </VCard>

  <div class="mobile-scheduler-view d-md-none">
    <div v-if="mobileSchedulerCards.length" class="mobile-scheduler-list">
      <article
        v-for="{ scheduler, visual, statusText, statusVariant } in mobileSchedulerCards"
        :key="scheduler.id"
        class="mobile-scheduler-card"
        :style="{
          '--scheduler-accent': visual.color,
          '--scheduler-accent-rgb': visual.rgb,
        }"
      >
        <div class="mobile-scheduler-icon">
          <VIcon :icon="visual.icon" size="30" />
        </div>

        <div class="mobile-scheduler-content">
          <h3>{{ scheduler.name }}</h3>
          <p>{{ scheduler.provider }}</p>
        </div>

        <div class="mobile-scheduler-actions">
          <span class="mobile-scheduler-status" :class="`mobile-scheduler-status--${statusVariant}`">
            {{ statusText }}
          </span>
          <VBtn
            icon
            class="mobile-scheduler-run-btn"
            :aria-label="t('setting.scheduler.execute')"
            :disabled="scheduler.status === t('setting.scheduler.running')"
            @click="runCommand(scheduler.id)"
          >
            <VIcon icon="mdi-play" size="24" />
          </VBtn>
        </div>
      </article>
    </div>

    <div v-else-if="!schedulerLoading" class="mobile-scheduler-empty">
      <VIcon icon="mdi-timer-off-outline" size="44" />
      <p>{{ t('setting.scheduler.noService') }}</p>
    </div>

    <footer v-if="schedulerLoading" class="mobile-scheduler-footer">
      <div class="mobile-scheduler-loading">
        <VProgressCircular indeterminate color="primary" size="18" width="2" />
        <span>{{ t('common.loadingText') }}</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.desktop-scheduler-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-block-size: 260px;
  color: rgba(var(--v-theme-on-surface), 0.52);
  flex-direction: column;
  gap: 12px;
}

.desktop-scheduler-empty p {
  margin: 0;
  font-size: 15px;
}

.mobile-scheduler-view {
  min-block-size: 100%;
  padding: 12px 18px calc(22px + env(safe-area-inset-bottom));
  background: transparent;
}

.mobile-scheduler-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.mobile-scheduler-card {
  display: grid;
  align-items: center;
  padding: 18px;
  border: 0;
  border-radius: var(--app-surface-radius);
  background: rgb(var(--v-theme-surface));
  backdrop-filter: none;
  box-shadow: none;
  column-gap: 14px;
  grid-template-columns: 62px minmax(0, 1fr) auto;
}

.mobile-scheduler-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(var(--scheduler-accent-rgb), 0.14);
  block-size: 58px;
  color: var(--scheduler-accent);
  inline-size: 58px;
}

.mobile-scheduler-content {
  min-inline-size: 0;
}

.mobile-scheduler-content h3 {
  overflow: hidden;
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-scheduler-content p {
  overflow: hidden;
  margin: 6px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-scheduler-actions {
  display: inline-flex;
  align-items: center;
  gap: 14px;
}

.mobile-scheduler-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.mobile-scheduler-status--running {
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
}

.mobile-scheduler-status--stopped {
  background: rgba(var(--v-theme-error), 0.12);
  color: rgb(var(--v-theme-error));
}

.mobile-scheduler-run-btn {
  border-radius: 50%;
  background: linear-gradient(135deg, #ff4f87, #e91e63) !important;
  block-size: 46px;
  box-shadow: 0 10px 22px rgba(233, 30, 99, 0.28);
  color: #fff !important;
  inline-size: 46px;
}

.mobile-scheduler-run-btn.v-btn--disabled {
  background: rgba(var(--v-theme-on-surface), 0.12) !important;
  box-shadow: none;
  color: rgba(var(--v-theme-on-surface), 0.42) !important;
}

.mobile-scheduler-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-block-size: 42vh;
  color: rgba(var(--v-theme-on-surface), 0.52);
  flex-direction: column;
  gap: 12px;
}

.mobile-scheduler-empty p {
  margin: 0;
  font-size: 15px;
}

.mobile-scheduler-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-block: 28px 4px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  flex-direction: column;
  font-size: 14px;
  gap: 8px;
}

.mobile-scheduler-loading {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 16px;
  font-weight: 600;
  gap: 10px;
}

html[data-theme='transparent'] .mobile-scheduler-card,
.v-theme--transparent .mobile-scheduler-card {
  background: rgba(var(--v-theme-surface), var(--transparent-opacity-light, 0.2));
  backdrop-filter: blur(var(--transparent-blur, 10px));
}

@media (max-width: 480px) {
  .mobile-scheduler-view {
    padding-inline: 14px;
  }

  .mobile-scheduler-card {
    padding: 16px;
    column-gap: 12px;
    grid-template-columns: 54px minmax(0, 1fr) auto;
  }

  .mobile-scheduler-icon {
    block-size: 50px;
    inline-size: 50px;
  }

  .mobile-scheduler-content h3 {
    font-size: 16px;
  }

  .mobile-scheduler-content p {
    font-size: 13px;
  }

  .mobile-scheduler-actions {
    gap: 8px;
  }

  .mobile-scheduler-status {
    padding: 5px 9px;
    font-size: 12px;
  }

  .mobile-scheduler-run-btn {
    block-size: 42px;
    inline-size: 42px;
  }
}
</style>
