<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { NotificationSwitch } from '@/api/types'

const messagemTypes = ref<NotificationSwitch[]>([])

// 选中的消息渠道
const selectedChannels = ref([])

// 消息渠道标签页
const messagerTab = ref('wechat')

// 消息设置
const notificationSettings = ref({
  WECHAT_CORPID: '',
  WECHAT_APP_SECRET: '',
  WECHAT_APP_ID: '',
  WECHAT_PROXY: '',
  WECHAT_TOKEN: '',
  WECHAT_ENCODING_AESKEY: '',
  WECHAT_ADMINS: '',
  TELEGRAM_TOKEN: '',
  TELEGRAM_CHAT_ID: '',
  TELEGRAM_USERS: '',
  TELEGRAM_ADMINS: '',
  SLACK_OAUTH_TOKEN: '',
  SLACK_APP_TOKEN: '',
  SLACK_CHANNEL: '',
  SYNOLOGYCHAT_WEBHOOK: '',
  SYNOLOGYCHAT_TOKEN: '',
  VOCECHAT_HOST: '',
  VOCECHAT_API_KEY: '',
  VOCECHAT_CHANNEL_ID: '',
})

// 消息渠道
const NotificationChannels = [
  {
    title: '微信',
    value: 'wechat',
  },
  {
    title: 'Telegram',
    value: 'telegram',
  },
  {
    title: 'Slack',
    value: 'slack',
  },
  {
    title: 'SynologyChat',
    value: 'synologychat',
  },
  {
    title: 'VoceChat',
    value: 'vocechat',
  },
  {
    title: 'WebPush',
    value: 'webpush',
  },
]

// 提示框
const $toast = useToast()

// 调用API查询消息开关
async function loadNotificationSwitchs() {
  try {
    const result: NotificationSwitch[] = await api.get('message/switchs')

    messagemTypes.value = result
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存消息开关
async function saveNotificationSwitchs() {
  try {
    const result: { [key: string]: any } = await api.post('message/switchs', messagemTypes.value)

    if (result.success) $toast.success('保存通知消息设置成功')
    else $toast.error('保存通知消息设置失败！')
  } catch (error) {
    console.log(error)
  }
}

// 调用API查询消息渠道设置
async function loadNotificationSettings() {
  try {
    const result1: { [key: string]: any } = await api.get('system/setting/MESSAGER')
    if (result1.success)
      selectedChannels.value = result1.data && result1.data.value ? result1.data.value.split(',') : []

    const result2: { [key: string]: any } = await api.get('system/env')
    if (result2.success) {
      const {
        WECHAT_CORPID,
        WECHAT_APP_SECRET,
        WECHAT_APP_ID,
        WECHAT_PROXY,
        WECHAT_TOKEN,
        WECHAT_ENCODING_AESKEY,
        WECHAT_ADMINS,
        TELEGRAM_TOKEN,
        TELEGRAM_CHAT_ID,
        TELEGRAM_USERS,
        TELEGRAM_ADMINS,
        SLACK_OAUTH_TOKEN,
        SLACK_APP_TOKEN,
        SLACK_CHANNEL,
        SYNOLOGYCHAT_WEBHOOK,
        SYNOLOGYCHAT_TOKEN,
        VOCECHAT_HOST,
        VOCECHAT_API_KEY,
        VOCECHAT_CHANNEL_ID,
      } = result2.data
      notificationSettings.value = {
        WECHAT_CORPID,
        WECHAT_APP_SECRET,
        WECHAT_APP_ID,
        WECHAT_PROXY,
        WECHAT_TOKEN,
        WECHAT_ENCODING_AESKEY,
        WECHAT_ADMINS,
        TELEGRAM_TOKEN,
        TELEGRAM_CHAT_ID,
        TELEGRAM_USERS,
        TELEGRAM_ADMINS,
        SLACK_OAUTH_TOKEN,
        SLACK_APP_TOKEN,
        SLACK_CHANNEL,
        SYNOLOGYCHAT_WEBHOOK,
        SYNOLOGYCHAT_TOKEN,
        VOCECHAT_HOST,
        VOCECHAT_API_KEY,
        VOCECHAT_CHANNEL_ID,
      }
    }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存消息渠道设置
async function saveNotificationSettings() {
  try {
    const result1: { [key: string]: any } = await api.post('system/setting/MESSAGER', selectedChannels.value.join(','))

    const result2: { [key: string]: any } = await api.post('system/env', notificationSettings.value)

    if (result1.success && result2.success) {
      $toast.success('保存通知渠道设置成功')
      reloadModule()
    } else {
      $toast.error('保存通知渠道设置失败！')
    }
  } catch (error) {
    console.log(error)
  }
}

// 调用API接口重新加载模块
async function reloadModule() {
  try {
    const result: { [key: string]: any } = await api.get('system/reload')
    if (result.success) $toast.success('重新加载模块成功')
    else $toast.error('重新加载模块失败！')
  } catch (error) {
    console.log(error)
  }
}

// 加载数据
onMounted(() => {
  loadNotificationSwitchs()
  loadNotificationSettings()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>通知渠道</VCardTitle>
          <VCardSubtitle>只有选中的渠道才会发送消息。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedChannels"
                  multiple
                  chips
                  :items="NotificationChannels"
                  label="当前使用通知渠道"
                  hint="消息通知渠道总开关"
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol>
                <VTabs v-model="messagerTab" stacked>
                  <VTab value="wechat"> 微信 </VTab>
                  <VTab value="telegram"> Telegram </VTab>
                  <VTab value="slack"> Slack </VTab>
                  <VTab value="synologychat"> SynologyChat </VTab>
                  <VTab value="vocechat"> VoceChat </VTab>
                </VTabs>
                <VWindow v-model="messagerTab" class="mt-5 disable-tab-transition" :touch="false">
                  <VWindowItem value="wechat">
                    <VForm>
                      <VRow>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="notificationSettings.WECHAT_CORPID"
                            label="企业ID"
                            hint="企业微信后台企业信息中的企业ID"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="notificationSettings.WECHAT_APP_ID"
                            label="应用 AgentId"
                            hint="企业微信自建应用的AgentId"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="notificationSettings.WECHAT_APP_SECRET"
                            label="应用Secret"
                            hint="企业微信自建应用的Secret"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="notificationSettings.WECHAT_PROXY"
                            label="代理地址"
                            hint="微信消息的转发代理地址，2022年6月20日后创建的自建应用才需要，不使用代理时需要保留默认值"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="notificationSettings.WECHAT_TOKEN"
                            label="Token"
                            hint="微信企业自建应用->API接收消息配置中的Token"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="notificationSettings.WECHAT_ENCODING_AESKEY"
                            label="EncodingAESKey"
                            hint="微信企业自建应用->API接收消息配置中的EncodingAESKey"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="notificationSettings.WECHAT_ADMINS"
                            label="管理员白名单"
                            placeholder="多个用,分隔"
                            hint="可使用管理菜单及命令的用户ID列表，多个ID使用,分隔"
                            persistent-hint
                          />
                        </VCol>
                      </VRow>
                    </VForm>
                  </VWindowItem>
                  <VWindowItem value="telegram">
                    <VForm>
                      <VRow>
                        <VCol cols="12" md="6">
                          <VTextField
                            v-model="notificationSettings.TELEGRAM_TOKEN"
                            label="Bot Token"
                            hint="Telegram机器人token，格式：123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="6">
                          <VTextField
                            v-model="notificationSettings.TELEGRAM_CHAT_ID"
                            label="Chat ID"
                            hint="接受消息通知的用户、群组或频道Chat ID"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="6">
                          <VTextField
                            v-model="notificationSettings.TELEGRAM_USERS"
                            label="用户白名单"
                            placeholder="多个用,分隔"
                            hint="可使用Telegram机器人的用户ID清单，多个用户用,分隔，不填写则所有用户都能使用"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="6">
                          <VTextField
                            v-model="notificationSettings.TELEGRAM_ADMINS"
                            label="管理员白名单"
                            placeholder="多个用,分隔"
                            hint="可使用管理菜单及命令的用户ID列表，多个ID使用,分隔"
                            persistent-hint
                          />
                        </VCol>
                      </VRow>
                    </VForm>
                  </VWindowItem>
                  <VWindowItem value="slack">
                    <VForm>
                      <VRow>
                        <VCol cols="12" md="5">
                          <VTextField
                            v-model="notificationSettings.SLACK_OAUTH_TOKEN"
                            label="Slack Bot User OAuth Token"
                            placeholder="xoxb-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx"
                            hint="Slack应用`OAuth & Permissions`页面中的`Bot User OAuth Token`"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="5">
                          <VTextField
                            v-model="notificationSettings.SLACK_APP_TOKEN"
                            label="Slack App-Level Token"
                            placeholder="xapp-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx"
                            hint="Slack应用`OAuth & Permissions`页面中的`App-Level Token`"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="2">
                          <VTextField
                            v-model="notificationSettings.SLACK_CHANNEL"
                            label="频道名称"
                            placeholder="全体"
                            hint="消息发送频道，默认`全体`"
                            persistent-hint
                          />
                        </VCol>
                      </VRow>
                    </VForm>
                  </VWindowItem>
                  <VWindowItem value="synologychat">
                    <VForm>
                      <VRow>
                        <VCol cols="12" md="6">
                          <VTextField
                            v-model="notificationSettings.SYNOLOGYCHAT_WEBHOOK"
                            label="机器人传入URL"
                            hint="Synology Chat机器人传入URL"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="6">
                          <VTextField
                            v-model="notificationSettings.SYNOLOGYCHAT_TOKEN"
                            label="令牌"
                            hint="Synology Chat机器人令牌"
                            persistent-hint
                          />
                        </VCol>
                      </VRow>
                    </VForm>
                  </VWindowItem>
                  <VWindowItem value="vocechat">
                    <VForm>
                      <VRow>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="notificationSettings.VOCECHAT_HOST"
                            label="地址"
                            hint="VoceChat服务端地址，格式：http(s)://ip:port"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="notificationSettings.VOCECHAT_API_KEY"
                            label="机器人密钥"
                            hint="VoceChat机器人密钥"
                            persistent-hint
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="notificationSettings.VOCECHAT_CHANNEL_ID"
                            label="频道ID"
                            placeholder="不包含#号"
                            hint="VoceChat的频道ID，不包含#号"
                            persistent-hint
                          />
                        </VCol>
                      </VRow>
                    </VForm>
                  </VWindowItem>
                </VWindow>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn mtype="submit" @click="saveNotificationSettings"> 保存 </VBtn>
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
          <VCardTitle>消息类型</VCardTitle>
          <VCardSubtitle>对应消息类型只会发送给选中的消息渠道。</VCardSubtitle>
        </VCardItem>
        <VTable class="text-no-wrap">
          <thead>
            <tr>
              <th scope="col">消息类型</th>
              <th scope="col">微信</th>
              <th scope="col">Telegram</th>
              <th scope="col">Slack</th>
              <th scope="col">SynologyChat</th>
              <th scope="col">VoceChat</th>
              <th scope="col">WebPush</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="message in messagemTypes" :key="message.mtype">
              <td>
                {{ message.mtype }}
              </td>
              <td>
                <VCheckbox v-model="message.wechat" />
              </td>
              <td>
                <VCheckbox v-model="message.telegram" />
              </td>
              <td>
                <VCheckbox v-model="message.slack" />
              </td>
              <td>
                <VCheckbox v-model="message.synologychat" />
              </td>
              <td>
                <VCheckbox v-model="message.vocechat" />
              </td>
              <td>
                <VCheckbox v-model="message.webpush" />
              </td>
            </tr>
            <tr v-if="messagemTypes.length === 0">
              <td colspan="6" class="text-center">没有设置任何通知渠道</td>
            </tr>
          </tbody>
        </VTable>
        <VDivider />
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn mtype="submit" @click="saveNotificationSwitchs"> 保存 </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
