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

// 初始化模板配置字典
const templateConfigs = ref<Record<string, string>>({
  organizeSuccess: '{}',
  downloadAdded: '{}',
  subscribeAdded: '{}',
  subscribeComplete: '{}',
})

// 模板类型配置
const templateTypes = ref([
  {
    type: 'organizeSuccess',
    label: t('setting.notification.organizeSuccess'),
  },
  {
    type: 'downloadAdded',
    label: t('setting.notification.downloadAdded'),
  },
  {
    type: 'subscribeAdded',
    label: t('setting.notification.subscribeAdded'),
  },
  {
    type: 'subscribeComplete',
    label: t('setting.notification.subscribeComplete'),
  },
])

// 编辑器主题
const { name: themeName, global: globalTheme } = useTheme()
const savedTheme = ref(localStorage.getItem('theme') ?? 'auto')
const currentThemeName = ref(savedTheme.value)
const editorTheme = computed(() => (currentThemeName.value === 'light' ? 'github' : 'monokai'))

// 所有消息渠道
const notifications = ref<NotificationConf[]>([])

// 提示框
const $toast = useToast()

const editorDialogOpen = ref(false)
const currentTemplate = ref('')
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

const wechatClawBotRenameMap = ref<Record<string, string>>({})

let editorDialogController: ReturnType<typeof openSharedDialog> | null = null

// 关闭通知模板共享弹窗，并同步本页的弹窗占用状态。
function closeTemplateEditorDialog() {
  editorDialogOpen.value = false
  editorDialogController?.close()
  editorDialogController = null
}

// 打开通知模板共享弹窗，保持内容通过事件回写到设置页。
function openTemplateEditorDialog(type: string) {
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

// 添加通知渠道
function addNotification(notification: string) {
  let name = `${t('setting.notification.channel')}${notifications.value.length + 1}`
  while (notifications.value.some(item => item.name === name)) {
    name = `${t('setting.notification.channel')}${parseInt(name.split(t('setting.notification.channel'))[1]) + 1}`
  }
  notifications.value.push({
    name: name,
    type: notification,
    enabled: false,
    config: {},
  })
}

// 移除通知渠道
function removeNotification(notification: NotificationConf) {
  const index = notifications.value.indexOf(notification)
  if (index > -1) notifications.value.splice(index, 1)
}

function trackWechatClawBotRename(oldName: string, newName: string) {
  if (!oldName || !newName || oldName === newName) {
    return
  }
  const renameMap = { ...wechatClawBotRenameMap.value }
  for (const [source, target] of Object.entries(renameMap)) {
    if (target === oldName) {
      renameMap[source] = newName
    }
  }
  if (renameMap[oldName]) {
    renameMap[oldName] = newName
  } else {
    renameMap[oldName] = newName
  }
  wechatClawBotRenameMap.value = Object.fromEntries(
    Object.entries(renameMap).filter(([source, target]) => source && target && source !== target),
  )
}

async function migrateWechatClawBotRenames() {
  const activeWechatClawBotNames = new Set(
    notifications.value.filter(item => item.type === 'wechatclawbot').map(item => item.name),
  )
  const renameEntries = Object.entries(wechatClawBotRenameMap.value).filter(
    ([oldName, newName]) => oldName && newName && oldName !== newName && activeWechatClawBotNames.has(newName),
  )
  for (const [oldName, newName] of renameEntries) {
    const result: { [key: string]: any } = await api.post('notification/wechatclawbot/migrate', null, {
      params: {
        old_source: oldName,
        new_source: newName,
      },
    })
    if (!result.success) {
      throw new Error(result.message || `failed to migrate ${oldName} -> ${newName}`)
    }
  }
}

// 调用API查询通知渠道设置
async function loadNotificationSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Notifications')
    notifications.value = result.data?.value ?? []
    wechatClawBotRenameMap.value = {}
  } catch (error) {
    console.log(error)
  }
}

async function openEditor(type: string) {
  try {
    currentTemplate.value = type
    const result: { [key: string]: any } = await api.get('system/setting/NotificationTemplates')
    templateConfigs.value = result.data?.value || {}
    editorContent.value = templateConfigs.value[type] || '{}'
    openTemplateEditorDialog(type)
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.templateLoadFailed'))
  }
}

async function saveTemplate(value = editorContent.value) {
  try {
    await api.post('system/setting/NotificationTemplates', {
      ...templateConfigs.value,
      [currentTemplate.value]: value,
    })
    $toast.success(t('setting.notification.templateSaveSuccess'))
    closeTemplateEditorDialog()
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.templateSaveFailed'))
  }
}

async function loadTemplateConfigs() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/NotificationTemplates')
    templateConfigs.value = result.data?.value || {}
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.templateLoadFailed'))
  }
}

// 调用API查询通知发送时间设置
async function loadNotificationTime() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/NotificationSendTime')
    notificationTime.value = result.data?.value ?? { start: '00:00', end: '23:59' }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存通知设置
async function saveNotificationSetting() {
  try {
    await migrateWechatClawBotRenames()
    const result: { [key: string]: any } = await api.post('system/setting/Notifications', notifications.value)
    if (result.success) {
      wechatClawBotRenameMap.value = {}
      $toast.success(t('setting.notification.saveSuccess'))
    } else $toast.error(t('setting.notification.saveFailed'))
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.notification.saveFailed'))
  }
}

// 调用API保存通知发送时间设置
async function saveNotificationTime() {
  try {
    const result: { [key: string]: any } = await api.post('system/setting/NotificationSendTime', notificationTime.value)
    if (result.success) {
      $toast.success(t('setting.notification.timeSaveSuccess'))
    } else $toast.error(t('setting.notification.timeSaveFailed'))
  } catch (error) {
    console.log(error)
  }
}

// 通知渠道设置变化时赋值
function changNotificationSetting(notification: NotificationConf, name: string) {
  const index = notifications.value.findIndex(item => item.name === name)
  if (index !== -1) {
    const previous = notifications.value[index]
    notifications.value[index] = notification
    if (previous?.type === 'wechatclawbot' && previous.name !== notification.name) {
      trackWechatClawBotRename(previous.name, notification.name)
    }
  }
}

// 加载消息类型开关
async function loadNotificationSwitchs() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/NotificationSwitchs')
    if (result.data?.value && result.data?.value.length > 0) {
      const savedSwitchs: NotificationSwitchConf[] = result.data.value
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
    const result: { [key: string]: any } = await api.post(
      'system/setting/NotificationSwitchs',
      notificationSwitchs.value,
    )
    if (result.success) $toast.success(t('setting.notification.switchSaveSuccess'))
    else $toast.error(t('setting.notification.switchSaveFailed'))
  } catch (error) {
    console.log(error)
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
          <Draggable
            v-model="notifications"
            handle=".cursor-move"
            item-key="name"
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
              <VBtn mtype="submit" @click="saveNotificationSetting" prepend-icon="mdi-content-save">
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
          <VRow>
            <VCol v-for="item in templateTypes" :key="item.type" cols="12" sm="6" md="3">
              <VCard variant="tonal" class="template-card" :class="{ 'on-hover': true }" @click="openEditor(item.type)">
                <VCardItem>
                  <template #prepend>
                    <VAvatar color="primary" variant="tonal" rounded size="42" class="me-3">
                      <VIcon
                        size="24"
                        :icon="
                          item.type === 'organizeSuccess'
                            ? 'mdi-folder-check'
                            : item.type === 'downloadAdded'
                            ? 'mdi-download'
                            : item.type === 'subscribeAdded'
                            ? 'mdi-rss'
                            : 'mdi-check-circle'
                        "
                      />
                    </VAvatar>
                  </template>
                  <VCardTitle>{{ item.label }}</VCardTitle>
                  <template #append>
                    <VIcon icon="mdi-chevron-right" />
                  </template>
                </VCardItem>
              </VCard>
            </VCol>
          </VRow>
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
/* Monaco编辑器容器样式 */
.monaco-editor-container {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  margin-block-start: 1rem;
}

.template-card {
  cursor: pointer;
  transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
}

.template-card.on-hover:hover {
  transform: translateY(-4px);
}
</style>
