<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { NotificationConf, NotificationSwitchConf } from '@/api/types'
import NotificationChannelCard from '@/components/cards/NotificationChannelCard.vue'
import { useI18n } from 'vue-i18n'
import { notificationSwitchDict } from '@/api/constants'
import { useTheme } from 'vuetify'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'

// 国际化
const { t } = useI18n()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 通知渠道排序按需加载，避免通知设置 chunk 直接包含拖拽库。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const NotificationTemplateEditorDialog = defineAsyncComponent(
  () => import('@/components/dialog/NotificationTemplateEditorDialog.vue'),
)

// 通知模板入口的图标和强调色统一维护，避免模板中散落长判断。
const templateTypeDefaults = [
  {
    type: 'organizeSuccess',
    icon: 'mdi-folder-check',
    accentRgb: 'var(--v-theme-primary)',
  },
  {
    type: 'downloadAdded',
    icon: 'mdi-download-box',
    accentRgb: 'var(--v-theme-info)',
  },
  {
    type: 'subscribeAdded',
    icon: 'mdi-rss-box',
    accentRgb: 'var(--v-theme-warning)',
  },
  {
    type: 'subscribeComplete',
    icon: 'mdi-check-circle',
    accentRgb: 'var(--v-theme-success)',
  },
] as const

type NotificationTemplateType = (typeof templateTypeDefaults)[number]['type']

// 初始化模板配置字典
const templateConfigs = ref<Record<string, string>>(
  templateTypeDefaults.reduce<Record<string, string>>((configs, item) => {
    configs[item.type] = '{}'
    return configs
  }, {}),
)

// 模板类型配置
const templateTypes = computed(() =>
  templateTypeDefaults.map(item => ({
    ...item,
    label: t(`setting.notification.${item.type}`),
  })),
)

function getTemplateAccentStyle(item: (typeof templateTypes.value)[number]) {
  return { '--app-card-accent-rgb': item.accentRgb }
}

// Ace 直接跟随 Vuetify 当前生效主题，auto 模式下也能按实际明暗色切换。
const { global: globalTheme } = useTheme()
const editorTheme = computed(() => (globalTheme.current.value.dark ? 'github_dark' : 'github_light_default'))

// 所有消息渠道
const notifications = ref<NotificationConf[]>([])

type NotificationConfigInput = Partial<NotificationConf> & {
  id?: unknown
}

interface NotificationConfigResponse {
  value?: NotificationConfigInput[]
}

type NotificationLoadState = 'idle' | 'loading' | 'ready' | 'error'

const notificationLoadState = ref<NotificationLoadState>('idle')
const notificationSaveLoading = ref(false)

// 提示框
const $toast = useToast()

const editorDialogOpen = ref(false)
const currentTemplate = ref<NotificationTemplateType | ''>('')
const editorContent = ref('')

// 消息类型开关
const notificationSwitchs = ref<NotificationSwitchConf[]>([
  {
    type: '资源下载',
    action: 'all',
  },
  {
    type: '整理入库',
    action: 'all',
  },
  {
    type: '订阅',
    action: 'all',
  },
  {
    type: '站点',
    action: 'admin',
  },
  {
    type: '媒体服务器',
    action: 'admin',
  },
  {
    type: '手动处理',
    action: 'admin',
  },
  {
    type: '插件',
    action: 'admin',
  },
  {
    type: '智能体',
    action: 'admin',
  },
  {
    type: '其它',
    action: 'admin',
  },
])

// 通知发送时间
const notificationTime = ref({
  start: '00:00',
  end: '23:59',
})

let editorDialogController: ReturnType<typeof openSharedDialog> | null = null

/** 创建仅用于新建渠道的稳定身份；保存后以后端归一化身份为准。 */
function createNotificationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `notification-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** 为旧配置建立与后端一致的可重复身份，避免在保存前退回到显示名称作为列表 key。 */
function createLegacyNotificationId(notification: NotificationConfigInput, index: number) {
  const type = typeof notification.type === 'string' ? notification.type : 'notification'
  const name = typeof notification.name === 'string' ? notification.name.trim() : ''
  return `legacy-${type}-${name || String(index)}`
}

/** 统一通知配置的身份、名称和可选字段，供 GET、编辑和保存共用。 */
function normalizeNotification(notification: NotificationConfigInput, index: number): NotificationConf {
  const rawId = notification.id
  const id =
    typeof rawId === 'string' && rawId.trim()
      ? rawId.trim()
      : typeof rawId === 'number'
        ? String(rawId)
        : createLegacyNotificationId(notification, index)
  const name = typeof notification.name === 'string' ? notification.name.trim() : ''
  const type = typeof notification.type === 'string' ? notification.type : ''
  const config = notification.config && typeof notification.config === 'object' ? notification.config : {}

  return {
    ...notification,
    id,
    name,
    type,
    config,
    enabled: Boolean(notification.enabled),
  }
}

function normalizeNotificationList(value: NotificationConfigInput[] = []) {
  return value.map((notification, index) => normalizeNotification(notification, index))
}

function notificationNameKey(name: string) {
  return name.trim().toLowerCase()
}

/** 检查名称是否为空或与另一个渠道重复，名称比较不区分大小写。 */
function validateNotificationNames(value: NotificationConf[]) {
  const names = new Set<string>()
  for (const notification of value) {
    const name = notification.name.trim()
    if (!name) {
      $toast.error(t('notification.nameRequired'))
      return false
    }
    const key = notificationNameKey(name)
    if (names.has(key)) {
      $toast.error(`${t('notification.channel')}【${name}】${t('common.exists')}`)
      return false
    }
    names.add(key)
  }
  return true
}

const canSaveNotifications = computed(() => notificationLoadState.value === 'ready' && !notificationSaveLoading.value)

// 关闭通知模板共享弹窗，并同步本页的弹窗占用状态。
function closeTemplateEditorDialog() {
  editorDialogOpen.value = false
  editorDialogController?.close()
  editorDialogController = null
}

// 打开通知模板共享弹窗，保持内容通过事件回写到设置页。
function openTemplateEditorDialog(type: NotificationTemplateType) {
  closeTemplateEditorDialog()
  editorDialogOpen.value = true
  editorDialogController = openSharedDialog(
    NotificationTemplateEditorDialog,
    {
      content: editorContent.value,
      editorTheme: editorTheme.value,
      subtitle: templateTypes.value.find(item => item.type === type)?.label ?? '',
      templateType: type,
    },
    {
      close: () => {
        editorDialogOpen.value = false
        editorDialogController = null
      },
      save: saveTemplate,
      'update:content': (value: string) => {
        editorContent.value = value
      },
      'update:modelValue': (value: boolean) => {
        if (!value) {
          editorDialogOpen.value = false
          editorDialogController = null
        }
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 共享弹窗的 props 是打开时写入的，主题切换时主动推送给已打开的编辑器。
watch(editorTheme, theme => {
  if (!editorDialogOpen.value) return

  editorDialogController?.updateProps({ editorTheme: theme })
})

// 添加通知渠道
function addNotification(notification: string) {
  const prefix = t('setting.notification.channel')
  let index = notifications.value.length + 1
  let name = `${prefix}${index}`
  while (notifications.value.some(item => notificationNameKey(item.name) === notificationNameKey(name))) {
    index += 1
    name = `${prefix}${index}`
  }
  notifications.value.push({
    id: createNotificationId(),
    name: name,
    type: notification,
    enabled: false,
    config: {},
  })
}

// 移除通知渠道
function removeNotification(notification: NotificationConf) {
  const index = notifications.value.findIndex(item => item.id === notification.id)
  if (index > -1) notifications.value.splice(index, 1)
}

// 调用API查询通知渠道设置
async function loadNotificationSetting() {
  notificationLoadState.value = 'loading'
  try {
    const result = await api.get<NotificationConfigResponse>('system/setting/Notifications')
    notifications.value = normalizeNotificationList(result.value)
    notificationLoadState.value = 'ready'
  } catch (error) {
    console.error(error)
    // 读取失败时保留当前可见配置，并锁住保存，避免用不完整列表覆盖服务端数据。
    notificationLoadState.value = 'error'
  }
}

async function openEditor(type: NotificationTemplateType) {
  try {
    currentTemplate.value = type
    const result = await api.get<{ value?: Record<string, string> }>('system/setting/NotificationTemplates', {
      feedback: 'silent',
    })
    templateConfigs.value = result.value || {}
    editorContent.value = templateConfigs.value[type] || '{}'
    openTemplateEditorDialog(type)
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.templateLoadFailed'))
  }
}

async function saveTemplate(value = editorContent.value) {
  try {
    await api.post(
      'system/setting/NotificationTemplates',
      {
        ...templateConfigs.value,
        [currentTemplate.value]: value,
      },
      { feedback: 'silent' },
    )
    $toast.success(t('setting.notification.templateSaveSuccess'))
    closeTemplateEditorDialog()
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.templateSaveFailed'))
  }
}

async function loadTemplateConfigs() {
  try {
    const result = await api.get<{ value?: Record<string, string> }>('system/setting/NotificationTemplates', {
      feedback: 'silent',
    })
    templateConfigs.value = result.value || {}
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.templateLoadFailed'))
  }
}

// 调用API查询通知发送时间设置
async function loadNotificationTime() {
  try {
    const result = await api.get<{ value?: { start: string; end: string } }>('system/setting/NotificationSendTime')
    notificationTime.value = result.value ?? { start: '00:00', end: '23:59' }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存通知设置
async function saveNotificationSetting() {
  if (!canSaveNotifications.value || !validateNotificationNames(notifications.value)) return

  notificationSaveLoading.value = true
  try {
    const payload = notifications.value.map((notification, index) => normalizeNotification(notification, index))
    notifications.value = payload
    const result = await api.post<NotificationConfigResponse>('notification/config', payload, { feedback: 'silent' })
    if (result?.value) {
      notifications.value = normalizeNotificationList(result.value)
    }
    $toast.success(t('setting.notification.saveSuccess'))
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.saveFailed'))
  } finally {
    notificationSaveLoading.value = false
  }
}

// 调用API保存通知发送时间设置
async function saveNotificationTime() {
  try {
    await api.post('system/setting/NotificationSendTime', notificationTime.value, { feedback: 'silent' })
    $toast.success(t('setting.notification.timeSaveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.notification.timeSaveFailed'))
  }
}

// 通知渠道设置变化时赋值
function changNotificationSetting(notification: NotificationConf, id: string) {
  const normalizedNotification = normalizeNotification(notification, notifications.value.length)
  const index = notifications.value.findIndex(item => item.id === id)
  if (index !== -1) {
    if (!normalizedNotification.name) {
      $toast.error(t('notification.nameRequired'))
      return
    }
    const duplicate = notifications.value.some(
      item => item.id !== id && notificationNameKey(item.name) === notificationNameKey(normalizedNotification.name),
    )
    if (duplicate) {
      $toast.error(`${t('notification.channel')}【${normalizedNotification.name}】${t('common.exists')}`)
      return
    }
    notifications.value[index] = normalizedNotification
  }
}

// 加载消息类型开关
async function loadNotificationSwitchs() {
  try {
    const result = await api.get<{ value?: NotificationSwitchConf[] }>('system/setting/NotificationSwitchs')
    if (result.value && result.value.length > 0) {
      const savedSwitchs = result.value
      // 合并默认值中存在但后端数据中缺失的类型（如新增的类型）
      const defaults = notificationSwitchs.value
      for (const def of defaults) {
        if (!savedSwitchs.find(item => item.type === def.type)) {
          savedSwitchs.push(def)
        }
      }
      notificationSwitchs.value = savedSwitchs
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存消息类型开关
async function saveNotificationSwitchs() {
  try {
    await api.post('system/setting/NotificationSwitchs', notificationSwitchs.value, { feedback: 'silent' })
    $toast.success(t('setting.notification.switchSaveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.notification.switchSaveFailed'))
  }
}

// 获取通知开关文本
function getNotificationSwitchText(type: string | undefined) {
  if (!type) return ''
  return notificationSwitchDict[type]
}

async function loadPageData() {
  await Promise.all([
    loadNotificationSetting(),
    loadNotificationSwitchs(),
    loadNotificationTime(),
    loadTemplateConfigs(),
  ])
}

// 加载数据
onMounted(() => {
  loadPageData()
})

useSilentSettingRefresh(loadPageData, {
  active: computed(() => props.active && !editorDialogOpen.value),
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.notification.channels') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.notification.channelsDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VAlert v-if="notificationLoadState === 'error'" type="error" variant="tonal" class="mb-4">
            {{ t('setting.notification.channelsLoadFailed') }}
          </VAlert>
          <Draggable
            v-model="notifications"
            handle=".cursor-move"
            item-key="id"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
          >
            <template #item="{ element }">
              <NotificationChannelCard
                :notification="element"
                :notifications="notifications"
                @change="changNotificationSetting"
                @close="removeNotification(element)"
              />
            </template>
          </Draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn
                mtype="submit"
                :loading="notificationSaveLoading"
                :disabled="!canSaveNotifications"
                @click="saveNotificationSetting"
                prepend-icon="mdi-content-save"
              >
                {{ t('common.save') }}
              </VBtn>
              <VBtn color="success" variant="tonal">
                <VIcon icon="mdi-plus" />
                <VMenu :activator="'parent'" :close-on-content-click="true">
                  <VList>
                    <VListItem @click="addNotification('wechat')">
                      <VListItemTitle>{{ t('setting.notification.wechat') }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addNotification('wechatclawbot')">
                      <VListItemTitle>{{ t('setting.notification.wechatClawBot') }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addNotification('feishu')">
                      <VListItemTitle>{{ t('setting.notification.feishu') }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addNotification('telegram')">
                      <VListItemTitle>{{ t('setting.notification.telegram') }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addNotification('slack')">
                      <VListItemTitle>{{ t('setting.notification.slack') }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addNotification('discord')">
                      <VListItemTitle>Discord</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addNotification('dingtalk')">
                      <VListItemTitle>{{ t('setting.notification.dingTalk') }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addNotification('synologychat')">
                      <VListItemTitle>{{ t('setting.notification.synologyChat') }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addNotification('qqbot')">
                      <VListItemTitle>{{ t('setting.notification.qq') }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addNotification('vocechat')">
                      <VListItemTitle>{{ t('setting.notification.voceChat') }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addNotification('webpush')">
                      <VListItemTitle>{{ t('setting.notification.webPush') }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addNotification('custom')">
                      <VListItemTitle>{{ t('setting.system.custom') }}</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.notification.templateConfigTitle') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.notification.templateConfigDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <div class="notification-template-grid">
            <button
              v-for="item in templateTypes"
              :key="item.type"
              type="button"
              class="notification-template-card app-card-shell app-card-colorful"
              :style="getTemplateAccentStyle(item)"
              @click="openEditor(item.type)"
            >
              <span class="template-card-icon">
                <VIcon :icon="item.icon" size="24" />
              </span>
              <span class="template-card-copy">
                <span class="template-card-title">{{ item.label }}</span>
                <span class="template-card-subtitle">Jinja2 JSON</span>
              </span>
              <VIcon class="template-card-arrow" icon="mdi-chevron-right" size="22" />
            </button>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.notification.scope') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.notification.scopeDesc') }}</VCardSubtitle>
        </VCardItem>
        <VTable class="text-no-wrap">
          <thead>
            <tr>
              <th scope="col">{{ t('setting.notification.messageType') }}</th>
              <th scope="col">{{ t('setting.notification.scopeRange') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in notificationSwitchs" :key="index">
              <td>
                {{ getNotificationSwitchText(item.type) }}
              </td>
              <td>
                <VRadioGroup v-model="item.action" inline>
                  <VRadio value="user" :label="t('setting.notification.operationUserOnly')" />
                  <VRadio value="admin" :label="t('setting.notification.adminOnly')" />
                  <VRadio value="user,admin" :label="t('setting.notification.userAndAdmin')" />
                  <VRadio value="all" :label="t('setting.notification.allUsers')" />
                </VRadioGroup>
              </td>
            </tr>
          </tbody>
        </VTable>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveNotificationSwitchs" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.notification.sendTime') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.notification.sendTimeDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VRow>
            <VCol cols="6">
              <VTextField
                v-model="notificationTime.start"
                :label="t('setting.notification.startTime')"
                type="time"
                prepend-inner-icon="mdi-clock-start"
              />
            </VCol>
            <VCol cols="6">
              <VTextField
                v-model="notificationTime.end"
                :label="t('setting.notification.endTime')"
                type="time"
                prepend-inner-icon="mdi-clock-end"
              />
            </VCol>
          </VRow>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveNotificationTime" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
<style scoped>
/* 模板入口保持设置页的紧凑密度，卡片壳层复用全局 app-card-shell。 */
.notification-template-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
}

.notification-template-card {
  position: relative;
  display: flex;
  align-items: center;
  padding: 1rem;
  cursor: pointer;
  gap: 0.875rem;
  inline-size: 100%;
  min-block-size: 5.25rem;
  text-align: start;
}

.template-card-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(var(--app-card-accent-rgb), 0.16);
  block-size: 2.75rem;
  color: rgb(var(--app-card-accent-rgb));
  inline-size: 2.75rem;
}

.template-card-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-inline-size: 0;
}

.template-card-title {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.98rem;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-card-subtitle {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.25;
  margin-block-start: 0.25rem;
}

.template-card-arrow {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.42);
  transition:
    color 0.2s ease,
    transform 0.2s ease;
}

.notification-template-card:hover .template-card-arrow {
  color: rgb(var(--app-card-accent-rgb));
  transform: translateX(2px);
}

@media (width <= 600px) {
  .notification-template-grid {
    gap: 0.75rem;
  }

  .notification-template-card {
    padding: 0.875rem;
    min-block-size: 4.75rem;
  }
}
</style>
