<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { NotificationSwitchConf } from '@/api/types'
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

// 提示框
const $toast = useToast()

const editorDialogOpen = ref(false)
const editorContent = ref('')

// 消息类型开关
const notificationSwitchs = ref<NotificationSwitchConf[]>([
  {
    type: '资源下载',
    action: 'all',
    missing_user: 'admin',
  },
  {
    type: '整理入库',
    action: 'all',
    missing_user: 'admin',
  },
  {
    type: '订阅',
    action: 'all',
    missing_user: 'admin',
  },
  {
    type: '站点',
    action: 'admin',
    missing_user: 'admin',
  },
  {
    type: '媒体服务器',
    action: 'admin',
    missing_user: 'admin',
  },
  {
    type: '手动处理',
    action: 'admin',
    missing_user: 'admin',
  },
  {
    type: '插件',
    action: 'admin',
    missing_user: 'admin',
  },
  {
    type: '智能体',
    action: 'admin',
    missing_user: 'admin',
  },
  {
    type: '其它',
    action: 'admin',
    missing_user: 'admin',
  },
])

// 通知发送时间
const notificationTime = ref({
  start: '00:00',
  end: '23:59',
})

let editorDialogController: ReturnType<typeof openSharedDialog> | null = null
let templateRequestId = 0
let editorGeneration = 0
let disposed = false

// 关闭通知模板共享弹窗，并同步本页的弹窗占用状态。
function closeTemplateEditorDialog() {
  templateRequestId++
  editorGeneration++
  editorDialogOpen.value = false
  editorDialogController?.close()
  editorDialogController = null
}

// 打开通知模板共享弹窗，保持内容通过事件回写到设置页。
function openTemplateEditorDialog(type: NotificationTemplateType) {
  closeTemplateEditorDialog()
  const generation = editorGeneration
  const active = () => !disposed && generation === editorGeneration && editorDialogOpen.value
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
        if (active()) closeTemplateEditorDialog()
      },
      save: (value: string) => {
        if (active()) return saveTemplate(value, type, generation)
      },
      'update:content': (value: string) => {
        if (active()) editorContent.value = value
      },
      'update:modelValue': (value: boolean) => {
        if (!value && active()) closeTemplateEditorDialog()
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

async function openEditor(type: NotificationTemplateType) {
  const requestId = ++templateRequestId
  try {
    const result = await api.get<{ value?: Record<string, string> }>('system/setting/NotificationTemplates', {
      feedback: 'silent',
    })
    if (disposed || requestId !== templateRequestId) return
    templateConfigs.value = result.value || {}
    editorContent.value = templateConfigs.value[type] || '{}'
    openTemplateEditorDialog(type)
  } catch (error) {
    if (disposed || requestId !== templateRequestId) return
    console.error(error)
    $toast.error(t('setting.notification.templateLoadFailed'))
  }
}

async function saveTemplate(value: string, type: NotificationTemplateType, generation: number) {
  try {
    await api.post(
      'system/setting/NotificationTemplates',
      { ...templateConfigs.value, [type]: value },
      { feedback: 'silent' },
    )
    if (disposed || generation !== editorGeneration) return
    $toast.success(t('setting.notification.templateSaveSuccess'))
    closeTemplateEditorDialog()
  } catch (error) {
    if (disposed || generation !== editorGeneration) return
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

// 加载消息类型开关
async function loadNotificationSwitchs() {
  try {
    const result = await api.get<{ value?: NotificationSwitchConf[] }>('system/setting/NotificationSwitchs')
    if (result.value && result.value.length > 0) {
      const savedSwitchs: NotificationSwitchConf[] = result.value.map(item => ({
        ...item,
        missing_user: item.missing_user ?? 'admin',
      }))
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
  await Promise.all([loadNotificationSwitchs(), loadNotificationTime(), loadTemplateConfigs()])
}

onBeforeUnmount(() => {
  disposed = true
  closeTemplateEditorDialog()
})

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
          <VCardTitle>{{ t('setting.notification.templateConfigTitle') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.notification.templateConfigDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <div class="notification-template-grid">
            <button
              v-for="item in templateTypes"
              :key="item.type"
              type="button"
              class="notification-template-card app-card-shell app-card-colorful mp-setting-card--interactive"
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
              <th scope="col">{{ t('setting.notification.missingUser') }}</th>
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
              <td>
                <VSelect
                  v-model="item.missing_user"
                  :items="[
                    { value: 'admin', title: t('setting.notification.missingUserAdmin') },
                    { value: 'skip', title: t('setting.notification.missingUserSkip') },
                  ]"
                  :disabled="!(item.action ?? '').split(',').includes('user')"
                  :aria-label="t('setting.notification.missingUser') + ' · ' + getNotificationSwitchText(item.type)"
                  :mobile-layout="false"
                  density="compact"
                  hide-details
                  class="notification-policy-select"
                />
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
            <VCol cols="12" sm="6">
              <VTextField
                v-model="notificationTime.start"
                :label="t('setting.notification.startTime')"
                type="time"
                prepend-inner-icon="mdi-clock-start"
              />
            </VCol>
            <VCol cols="12" sm="6">
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
.notification-policy-select {
  min-inline-size: 12rem;
}

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
  border: 1px solid rgba(var(--app-card-accent-rgb), 0.22);
  border-radius: 12px;
  background: rgba(var(--app-card-accent-rgb), 0.13);
  block-size: 2.625rem;
  color: color-mix(in srgb, rgb(var(--app-card-accent-rgb)) 78%, var(--mp-fg));
  inline-size: 2.625rem;
}

.template-card-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-inline-size: 0;
}

.template-card-title {
  overflow: hidden;
  color: var(--mp-fg);
  font-size: 0.98rem;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-card-subtitle {
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
  line-height: 1.25;
  margin-block-start: 0.25rem;
}

.template-card-arrow {
  flex: 0 0 auto;
  color: var(--mp-faint);
  transition:
    color 0.2s ease,
    transform 0.2s ease;
}

@media (hover: hover) {
  .notification-template-card:hover .template-card-arrow {
    color: rgb(var(--app-card-accent-rgb));
    transform: translateX(2px);
  }
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
