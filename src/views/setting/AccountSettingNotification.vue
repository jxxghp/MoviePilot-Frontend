<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import draggable from 'vuedraggable'
import type { NotificationConf, NotificationSwitchConf } from '@/api/types'
import NotificationChannelCard from '@/components/cards/NotificationChannelCard.vue'
import ProgressDialog from '@/components/dialog/ProgressDialog.vue'
import { useI18n } from 'vue-i18n'
import { notificationSwitchDict } from '@/api/constants'
import { useTheme, useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 国际化
const { t } = useI18n()

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

// 进度框
const progressDialog = ref(false)
const editorVisible = ref(false)
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

// 调用API查询通知渠道设置
async function loadNotificationSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Notifications')
    notifications.value = result.data?.value ?? []
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
    editorVisible.value = true
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.templateLoadFailed'))
  }
}

async function saveTemplate() {
  try {
    await api.post('system/setting/NotificationTemplates', {
      ...templateConfigs.value,
      [currentTemplate.value]: editorContent.value,
    })
    $toast.success(t('setting.notification.templateSaveSuccess'))
    editorVisible.value = false
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
    const result: { [key: string]: any } = await api.post('system/setting/Notifications', notifications.value)
    if (result.success) {
      $toast.success(t('setting.notification.saveSuccess'))
    } else $toast.error(t('setting.notification.saveFailed'))
  } catch (error) {
    console.log(error)
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
  if (index !== -1) notifications.value[index] = notification
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

// 加载数据
onMounted(() => {
  loadNotificationSetting()
  loadNotificationSwitchs()
  loadNotificationTime()
  loadTemplateConfigs()
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
          <draggable
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
          </draggable>
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
  <!-- 进度框 -->
  <ProgressDialog
    v-if="progressDialog"
    v-model="progressDialog"
    :text="t('setting.system.reloading')"
    :indeterminate="true"
  />
  <!-- 模板编辑器对话框 -->
  <VDialog v-model="editorVisible" v-if="editorVisible" max-width="50rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-code-json" class="me-2" />
        </template>
        <VCardTitle>
          {{ t('setting.notification.templateConfigTitle') }}
        </VCardTitle>
        <VCardSubtitle>
          {{ templateTypes.find(t => t.type === currentTemplate)?.label }}
        </VCardSubtitle>
        <VDialogCloseBtn @click="editorVisible = false" />
      </VCardItem>
      <VCardText class="py-0">
        <VAceEditor
          v-model:value="editorContent"
          lang="json"
          :theme="editorTheme"
          class="w-full h-full min-h-[30rem] rounded"
        />
      </VCardText>
      <VCardActions class="pt-3">
        <VBtn color="primary" @click="saveTemplate" prepend-icon="mdi-content-save" class="px-5">
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
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
