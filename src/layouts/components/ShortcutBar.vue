<script lang="ts" setup>
import NameTestView from '@/views/system/NameTestView.vue'
import NetTestView from '@/views/system/NetTestView.vue'
import LoggingView from '@/views/system/LoggingView.vue'
import RuleTestView from '@/views/system/RuleTestView.vue'
import ModuleTestView from '@/views/system/ModuleTestView.vue'
import MessageView from '@/views/system/MessageView.vue'
import store from '@/store'
import api from '@/api'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// App捷径
const appsMenu = ref(false)

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

// 输入消息
const user_message = ref('')

// 发送按钮是否可用
const sendButtonDisabled = ref(false)

// 聊天容器
const chatContainer = ref<HTMLDivElement>()

// 滚动到底部
function scrollMessageToEnd() {
  nextTick(() => {
    if (chatContainer.value) {
      const scrollDiv = chatContainer.value.$el
      scrollDiv.scrollTop = scrollDiv.scrollHeight
    }
  })
}

// 拼接全部日志url
function allLoggingUrl() {
  const token = store.state.auth.token
  return `${import.meta.env.VITE_API_BASE_URL}system/logging?token=${token}&length=-1`
}

// 发送消息
async function sendMessage() {
  if (user_message.value) {
    try {
      sendButtonDisabled.value = true
      await api.post(`message/web?text=${user_message.value}`)
      user_message.value = ''
      sendButtonDisabled.value = false
      scrollMessageToEnd()
    } catch (error) {
      console.error(error)
    }
  }
}

onMounted(() => {
  scrollMessageToEnd()
})
</script>

<template>
  <VMenu
    v-model="appsMenu"
    max-width="600"
    width="340"
    max-height="560"
    location="top end"
    origin="top end"
    transition="scale-transition"
    close-on-content-click
  >
    <!-- Menu Activator -->
    <template #activator="{ props }">
      <IconBtn class="ms-2" v-bind="props">
        <VIcon icon="mdi-checkbox-multiple-blank-outline" />
      </IconBtn>
    </template>
    <!-- Menu Content -->
    <VCard>
      <VCardItem class="border-b">
        <VCardTitle>捷径</VCardTitle>
        <template #append>
          <IconBtn @click="() => {}">
            <VIcon icon="mdi-checkbox-multiple-blank-outline" />
          </IconBtn>
        </template>
      </VCardItem>
      <div class="ps ps--active-y">
        <VRow class="ma-0 mt-n1">
          <VCol cols="6" class="text-center cursor-pointer pa-0 shortcut-icon border-e">
            <VListItem class="pa-4" @click="nameTestDialog = true">
              <VAvatar size="48" variant="tonal">
                <VIcon icon="mdi-text-recognition" />
              </VAvatar>
              <h6 class="text-base font-weight-medium mt-2 mb-0">识别</h6>
              <span class="text-sm">名称识别测试</span>
            </VListItem>
          </VCol>
          <VCol cols="6" class="text-center cursor-pointer pa-0 shortcut-icon border-e" @click="() => {}">
            <VListItem class="pa-4" @click="ruleTestDialog = true">
              <VAvatar size="48" variant="tonal">
                <VIcon icon="mdi-filter-cog-outline" />
              </VAvatar>
              <h6 class="text-base font-weight-medium mt-2 mb-0">优先级</h6>
              <span class="text-sm">优先级规则测试</span>
            </VListItem>
          </VCol>
        </VRow>
        <VRow class="ma-0 mt-n1 border-t">
          <VCol cols="6" class="text-center cursor-pointer pa-0 shortcut-icon border-e" @click="() => {}">
            <VListItem class="pa-4" @click="loggingDialog = true">
              <VAvatar size="48" variant="tonal">
                <VIcon icon="mdi-file-document-outline" />
              </VAvatar>
              <h6 class="text-base font-weight-medium mt-2 mb-0">日志</h6>
              <span class="text-sm">实时日志</span>
            </VListItem>
          </VCol>
          <VCol cols="6" class="text-center cursor-pointer pa-0 shortcut-icon" @click="() => {}">
            <VListItem class="pa-4" @click="netTestDialog = true">
              <VAvatar size="48" variant="tonal">
                <VIcon icon="mdi-network-outline" />
              </VAvatar>
              <h6 class="text-base font-weight-medium mt-2 mb-0">网络</h6>
              <span class="text-sm">网速连通性测试</span>
            </VListItem>
          </VCol>
        </VRow>
        <VRow class="ma-0 mt-n1 border-t">
          <VCol cols="6" class="text-center cursor-pointer pa-0 shortcut-icon border-e" @click="() => {}">
            <VListItem class="pa-4" @click="systemTestDialog = true">
              <VAvatar size="48" variant="tonal">
                <VIcon icon="mdi-cog-outline" />
              </VAvatar>
              <h6 class="text-base font-weight-medium mt-2 mb-0">系统</h6>
              <span class="text-sm">健康检查</span>
            </VListItem>
          </VCol>
          <VCol cols="6" class="text-center cursor-pointer pa-0 shortcut-icon border-e" @click="() => {}">
            <VListItem class="pa-4" @click="messageDialog = true">
              <VAvatar size="48" variant="tonal">
                <VIcon icon="mdi-message-outline" />
              </VAvatar>
              <h6 class="text-base font-weight-medium mt-2 mb-0">消息</h6>
              <span class="text-sm">消息中心</span>
            </VListItem>
          </VCol>
        </VRow>
      </div>
    </VCard>
  </VMenu>
  <!-- 名称测试弹窗 -->
  <VDialog v-if="nameTestDialog" v-model="nameTestDialog" max-width="50rem" scrollable>
    <VCard title="名称识别测试">
      <DialogCloseBtn @click="nameTestDialog = false" />
      <VCardText>
        <NameTestView />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 网络测试弹窗 -->
  <VDialog v-if="netTestDialog" v-model="netTestDialog" max-width="35rem" max-height="85vh" scrollable>
    <VCard title="网络测试">
      <DialogCloseBtn @click="netTestDialog = false" />
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
      <DialogCloseBtn @click="loggingDialog = false" />
      <VCardItem>
        <VCardTitle class="inline-flex">
          实时日志
          <a class="mx-2 inline-flex items-center justify-center" :href="allLoggingUrl()" target="_blank">
            <div
              class="inline-flex cursor-pointer items-center rounded-full bg-gray-600 px-2 text-sm text-gray-200 ring-1 ring-gray-500 transition hover:bg-gray-700"
            >
              <VIcon icon="mdi-open-in-new" />
              <span class="ms-1">在新窗口中打开</span>
            </div>
          </a>
        </VCardTitle>
      </VCardItem>
      <VCardText>
        <LoggingView />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 规则测试弹窗 -->
  <VDialog v-if="ruleTestDialog" v-model="ruleTestDialog" max-width="50rem" scrollable>
    <VCard title="优先级测试">
      <DialogCloseBtn @click="ruleTestDialog = false" />
      <VCardText>
        <RuleTestView />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 系统健康检查弹窗 -->
  <VDialog v-if="systemTestDialog" v-model="systemTestDialog" max-width="35rem" max-height="85vh" scrollable>
    <VCard title="系统健康检查">
      <DialogCloseBtn @click="systemTestDialog = false" />
      <VCardText>
        <ModuleTestView />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 消息中心弹窗 -->
  <VDialog
    v-if="messageDialog"
    v-model="messageDialog"
    max-width="60rem"
    scrollable
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard title="消息中心">
      <DialogCloseBtn @click="messageDialog = false" />
      <VCardText ref="chatContainer">
        <MessageView @scroll="scrollMessageToEnd" />
      </VCardText>

      <VCardItem>
        <VTextField
          v-model="user_message"
          placeholder="输入消息或命令"
          outlined
          hide-details
          single-line
          clearable
          density="compact"
          :disabled="sendButtonDisabled"
          @keydown.enter="sendMessage"
        >
          <template #append>
            <VBtn color="primary" :disabled="sendButtonDisabled" @click="sendMessage"> 发送 </VBtn>
          </template>
        </VTextField>
      </VCardItem>
    </VCard>
  </VDialog>
</template>
