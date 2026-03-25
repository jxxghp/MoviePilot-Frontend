<script lang="ts" setup>
import NameTestView from '@/views/system/NameTestView.vue'
import NetTestView from '@/views/system/NetTestView.vue'
import LoggingView from '@/views/system/LoggingView.vue'
import RuleTestView from '@/views/system/RuleTestView.vue'
import ModuleTestView from '@/views/system/ModuleTestView.vue'
import MessageView from '@/views/system/MessageView.vue'
import WordsView from '@/views/system/WordsView.vue'
import CacheView from '@/views/system/CacheView.vue'
import AccountSettingService from '@/views/system/ServiceView.vue'
import api from '@/api'
import { useDisplay } from 'vuetify'
import { getQueryValue } from '@/@core/utils'
import { useI18n } from 'vue-i18n'
import { clearAppBadge } from '@/utils/badge'

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// App捷径
const appsMenu = ref(false)

// 菜单最大宽度
const menuMaxWidth = ref(420)

// 名称测试弹窗
const nameTestDialog = ref(false)

// 网络测试弹窗
const netTestDialog = ref(false)

// 实时日志弹窗
const loggingDialog = ref(false)

// 过滤规则弹窗
const ruleTestDialog = ref(false)

// 系统健康检查弹窗
const systemTestDialog = ref(false)

// 消息中心弹窗
const messageDialog = ref(false)

// 词表设置弹窗
const wordsDialog = ref(false)

// 缓存管理弹窗
const cacheDialog = ref(false)

// 定时服务弹窗
const schedulerDialog = ref(false)

// 输入消息
const user_message = ref('')

// 发送按钮是否可用
const sendButtonDisabled = ref(false)

// 消息对话框引用
const messageDialogRef = ref<any>(null)

// 消息视图引用
const messageViewRef = ref<any>(null)

// 滚动容器引用
const messageContentRef = ref<any>()

// 定义捷径列表
const shortcuts = [
  {
    title: t('shortcut.recognition.title'),
    subtitle: t('shortcut.recognition.subtitle'),
    icon: 'mdi-text-recognition',
    dialog: 'nameTest',
    dialogRef: nameTestDialog,
  },
  {
    title: t('shortcut.rule.title'),
    subtitle: t('shortcut.rule.subtitle'),
    icon: 'mdi-filter-cog',
    dialog: 'ruleTest',
    dialogRef: ruleTestDialog,
  },
  {
    title: t('shortcut.log.title'),
    subtitle: t('shortcut.log.subtitle'),
    icon: 'mdi-file-document',
    dialog: 'logging',
    dialogRef: loggingDialog,
  },
  {
    title: t('shortcut.network.title'),
    subtitle: t('shortcut.network.subtitle'),
    icon: 'mdi-network',
    dialog: 'netTest',
    dialogRef: netTestDialog,
  },
  {
    title: t('shortcut.words.title'),
    subtitle: t('shortcut.words.subtitle'),
    icon: 'mdi-file-word-box',
    dialog: 'words',
    dialogRef: wordsDialog,
  },
  {
    title: t('shortcut.cache.title'),
    subtitle: t('shortcut.cache.subtitle'),
    icon: 'mdi-database',
    dialog: 'cache',
    dialogRef: cacheDialog,
  },
  {
    title: t('shortcut.scheduler.title'),
    subtitle: t('shortcut.scheduler.subtitle'),
    icon: 'mdi-list-box',
    dialog: 'scheduler',
    dialogRef: schedulerDialog,
  },
  {
    title: t('shortcut.system.title'),
    subtitle: t('shortcut.system.subtitle'),
    icon: 'mdi-cog',
    dialog: 'systemTest',
    dialogRef: systemTestDialog,
  },
  {
    title: t('shortcut.message.title'),
    subtitle: t('shortcut.message.subtitle'),
    icon: 'mdi-message',
    dialog: 'message',
    dialogRef: messageDialog,
  },
]

// 打开对话框
function openDialog(dialogRef: any) {
  dialogRef.value = true
}

// 打开消息弹窗并清除徽章
async function openMessageDialog() {
  messageDialog.value = true
  // 延迟清除徽章，确保对话框已经打开
  setTimeout(async () => {
    await clearAppBadge()
  }, 500)
  // 延迟滚动到底部，确保弹窗完全打开
  setTimeout(() => {
    forceScrollToEnd()
  }, 600)
  // 等待对话框打开后恢复SSE连接
  nextTick(() => {
    if (messageViewRef.value && typeof messageViewRef.value.resumeSSE === 'function') {
      messageViewRef.value.resumeSSE()
    }
  })
}

// 智能滚动到底部（只有用户在底部附近时才滚动）
function scrollMessageToEnd() {
  // 使用更长的延迟确保DOM已更新
  setTimeout(() => {
    try {
      // 查找消息弹窗的滚动容器
      const cardText = document.querySelector('.v-dialog .v-card-text')
      if (cardText) {
        const { scrollTop, scrollHeight, clientHeight } = cardText
        // 计算距离底部的距离
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight
        // 如果用户距离底部小于1/3屏幕高度，认为用户在底部附近，执行自动滚动
        if (distanceFromBottom <= clientHeight / 3) {
          cardText.scrollTop = cardText.scrollHeight
        }
      }
    } catch (error) {
      console.error(error)
    }
  }, 500) // 增加延迟时间
}

// 强制滚动到底部（用于发送消息后）
function forceScrollToEnd() {
  setTimeout(() => {
    try {
      // 查找消息弹窗的滚动容器
      const cardText = document.querySelector('.v-dialog .v-card-text')
      if (cardText) {
        cardText.scrollTop = cardText.scrollHeight
      }
    } catch (error) {
      console.error(error)
    }
  }, 500)
}

// 拼接全部日志url
function allLoggingUrl() {
  return `${import.meta.env.VITE_API_BASE_URL}system/logging?length=-1`
}

// 发送消息
async function sendMessage() {
  if (user_message.value) {
    try {
      sendButtonDisabled.value = true
      await api.post(`message/web?text=${user_message.value}`)
      user_message.value = ''
      sendButtonDisabled.value = false
      forceScrollToEnd() // 发送消息后强制滚动到底部
    } catch (error) {
      console.error(error)
    }
  }
}

// 供外部调用的打开消息弹窗方法
function openMessageDialogFromExternal() {
  openMessageDialog()
}

// 暴露方法给父组件
defineExpose({
  openMessageDialog: openMessageDialogFromExternal,
})

// 监听消息对话框状态变化
watch(messageDialog, newValue => {
  if (!newValue && messageViewRef.value && typeof messageViewRef.value.pauseSSE === 'function') {
    // 对话框关闭时暂停SSE连接
    messageViewRef.value.pauseSSE()
  }
})

onMounted(() => {
  const shortcut = getQueryValue('shortcut')
  if (shortcut) {
    const found = shortcuts.find(item => item.dialog === shortcut)
    if (found) {
      found.dialogRef.value = true
    }
  }
})
</script>

<template>
  <VMenu
    v-model="appsMenu"
    :max-width="menuMaxWidth"
    width="100%"
    max-height="560"
    location="top end"
    origin="top end"
    close-on-content-click
    close-on-back
    scrim
  >
    <!-- Menu Activator -->
    <template #activator="{ props }">
      <IconBtn class="ms-2" v-bind="props">
        <VIcon icon="mdi-card-multiple-outline" />
      </IconBtn>
    </template>
    <!-- Menu Content -->
    <VCard class="overflow-hidden">
      <VCardItem class="py-3">
        <VCardTitle>{{ t('shortcut.title') }}</VCardTitle>
        <template #append>
          <IconBtn @click="appsMenu = false">
            <VIcon icon="mdi-close" />
          </IconBtn>
        </template>
      </VCardItem>
      <VDivider />
      <div class="pa-3">
        <div class="grid grid-cols-2 gap-3">
          <!-- 循环渲染快捷方式 -->
          <div v-for="(item, index) in shortcuts" :key="index">
            <VCard
              flat
              class="pa-2 d-flex align-center cursor-pointer transition-transform duration-300 hover:-translate-y-1 border h-full"
              hover
              @click="
                item.dialog === 'message'
                  ? openMessageDialog()
                  : item.dialog === 'words'
                    ? openDialog(item.dialogRef)
                    : item.dialog === 'cache'
                      ? openDialog(item.dialogRef)
                      : openDialog(item.dialogRef)
              "
            >
              <VAvatar variant="text" size="48" rounded="lg">
                <VIcon color="primary" :icon="item.icon" size="24" />
              </VAvatar>
              <div>
                <div class="text-body-1 text-high-emphasis font-weight-medium">{{ item.title }}</div>
                <div class="text-caption text-medium-emphasis">{{ item.subtitle }}</div>
              </div>
            </VCard>
          </div>
        </div>
      </div>
    </VCard>
  </VMenu>
  <!-- 名称测试弹窗 -->
  <VDialog
    v-if="nameTestDialog"
    v-model="nameTestDialog"
    max-width="45rem"
    scrollable
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-text-recognition" class="me-2" />
          {{ t('shortcut.recognition.title') }}
        </VCardTitle>
        <VDialogCloseBtn @click="nameTestDialog = false" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <NameTestView />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 网络测试弹窗 -->
  <VDialog
    v-if="netTestDialog"
    v-model="netTestDialog"
    max-width="35rem"
    scrollable
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-network" class="me-2" />
          {{ t('shortcut.network.subtitle') }}
        </VCardTitle>
        <VDialogCloseBtn @click="netTestDialog = false" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <NetTestView />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 实时日志弹窗 -->
  <VDialog
    v-if="loggingDialog"
    v-model="loggingDialog"
    scrollable
    max-width="70rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard>
      <VDialogCloseBtn @click="loggingDialog = false" />
      <VCardItem>
        <VCardTitle class="d-inline-flex">
          <VIcon icon="mdi-file-document" class="me-2" />
          {{ t('shortcut.log.subtitle') }}
          <a class="mx-2 d-inline-flex align-center" :href="allLoggingUrl()" target="_blank">
            <VChip color="grey-darken-1" size="small" class="ml-2">
              <VIcon icon="mdi-open-in-new" size="small" start />
              {{ t('common.openInNewWindow') }}
            </VChip>
          </a>
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <LoggingView logfile="moviepilot.log" />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 过滤规则弹窗 -->
  <VDialog
    v-if="ruleTestDialog"
    v-model="ruleTestDialog"
    max-width="35rem"
    scrollable
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-filter-cog" class="me-2" />
          {{ t('shortcut.rule.subtitle') }}
        </VCardTitle>
        <VDialogCloseBtn @click="ruleTestDialog = false" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <RuleTestView />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 词表设置弹窗 -->
  <VDialog v-if="wordsDialog" v-model="wordsDialog" max-width="60rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-file-word-box" class="me-2" />
          {{ t('shortcut.words.subtitle') }}
        </VCardTitle>
        <VDialogCloseBtn @click="wordsDialog = false" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <WordsView />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 缓存管理弹窗 -->
  <VDialog v-if="cacheDialog" v-model="cacheDialog" max-width="90rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-database" class="me-2" />
          {{ t('shortcut.cache.subtitle') }}
        </VCardTitle>
        <VDialogCloseBtn @click="cacheDialog = false" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <CacheView />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 定时服务弹窗 -->
  <VDialog
    v-if="schedulerDialog"
    v-model="schedulerDialog"
    max-width="60rem"
    scrollable
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard>
      <VCardItem class="py-2">
        <VCardTitle>
          <VIcon icon="mdi-list-box" class="me-2" />
          {{ t('shortcut.scheduler.subtitle') }}
        </VCardTitle>
        <VCardSubtitle>{{ t('setting.scheduler.subtitle') }}</VCardSubtitle>
        <VDialogCloseBtn @click="schedulerDialog = false" />
      </VCardItem>
      <VDivider />
      <VCardText class="pa-0">
        <AccountSettingService />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 系统健康检查弹窗 -->
  <VDialog
    v-if="systemTestDialog"
    v-model="systemTestDialog"
    max-width="35rem"
    scrollable
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-cog" class="me-2" />
          {{ t('shortcut.system.subtitle') }}
        </VCardTitle>
        <VDialogCloseBtn @click="systemTestDialog = false" />
      </VCardItem>
      <VDivider />
      <VCardText class="pa-0">
        <ModuleTestView />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 消息中心弹窗 -->
  <VDialog
    v-if="messageDialog"
    v-model="messageDialog"
    max-width="50rem"
    scrollable
    :fullscreen="!display.mdAndUp.value"
    ref="messageDialogRef"
  >
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-message" class="me-2" />
          {{ t('shortcut.message.subtitle') }}
        </VCardTitle>
        <VDialogCloseBtn @click="messageDialog = false" />
      </VCardItem>
      <VDivider />
      <VCardText ref="messageContentRef">
        <MessageView ref="messageViewRef" @scroll="scrollMessageToEnd" />
      </VCardText>
      <VDivider />
      <VCardActions class="pa-4">
        <div class="d-flex w-100 gap-2">
          <VTextField
            v-model="user_message"
            variant="outlined"
            hide-details
            density="compact"
            :placeholder="t('common.inputMessage')"
            @keyup.enter="sendMessage"
          />
          <VBtn
            variant="elevated"
            :disabled="sendButtonDisabled"
            @click="sendMessage"
            :loading="sendButtonDisabled"
            color="primary"
            prepend-icon="mdi-send"
            >{{ t('common.send') }}
          </VBtn>
        </div>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
