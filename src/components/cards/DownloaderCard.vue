<script setup lang="ts">
import api from '@/api'
import { formatFileSize } from '@/@core/utils/formatters'
import { DownloaderConf } from '@/api/types'
import { useToast } from 'vue-toast-notification'
import type { DownloaderInfo } from '@/api/types'
import qbittorrent_image from '@images/logos/qbittorrent.png'
import transmission_image from '@images/logos/transmission.png'

// 定义输入
const props = defineProps({
  // 单个下载器
  downloader: {
    type: Object as PropType<DownloaderConf>,
    required: true,
  },
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
  // 所有下载器
  downloaders: {
    type: Array as PropType<DownloaderConf[]>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'done', 'change'])

// 提示框
const $toast = useToast()

// timeout定时器
let timeoutTimer: NodeJS.Timeout | undefined = undefined

// 上传速率
const upload_rate = ref(0)

// 下载速度
const download_rate = ref(0)

// 下载器详情弹窗
const downloaderInfoDialog = ref(false)

// 下载器名称
const downloaderName = ref('')

// 下载器详情
const downloaderInfo = ref<DownloaderConf>({
  name: '',
  type: '',
  default: false,
  enabled: false,
  config: {},
})

// 调用API查询下载器数据
async function loadDownloaderInfo() {
  if (!props.allowRefresh) {
    return
  }
  try {
    const res: DownloaderInfo = await api.get('dashboard/downloader', {
      params: {
        name: props.downloader.name,
      },
    })

    if (res) {
      upload_rate.value = res.upload_speed
      download_rate.value = res.download_speed
      // 定时查询
      clearTimeout(timeoutTimer)
      if (props.downloader.enabled) {
        timeoutTimer = setTimeout(loadDownloaderInfo, 3000)
      }
    }
  } catch (e) {
    console.log(e)
  }
}

// 打开详情弹窗
function openDownloaderInfoDialog() {
  downloaderInfo.value = props.downloader
  downloaderName.value = props.downloader.name
  downloaderInfoDialog.value = true
}

// 保存详情数据
function saveDownloaderInfo() {
  // 为空不保存，跳出警告框
  if (!downloaderName.value) {
    $toast.error('名称不能为空，请输入后再确定')
    return
  }
  // 重名判断
  if (props.downloaders.some(item => item.name === downloaderName.value && item !== props.downloader)) {
    $toast.error(`【${downloaderName.value}】已存在，请替换为其他名称`)
    return
  }
  // 默认下载器去重
  if (downloaderInfo.value.default) {
    props.downloaders.forEach(item => {
      if (item.default && item !== props.downloader) {
        item.default = false
        $toast.info(`【${item.name}】存在默认下载器，已替换成【${downloaderName.value}】`)
      }
    })
  }
  // 执行保存
  downloaderInfoDialog.value = false
  downloaderInfo.value.name = downloaderName.value
  emit('change', downloaderInfo.value)
  emit('done')
}

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.downloader.type) {
    case 'qbittorrent':
      return qbittorrent_image
    case 'transmission':
      return transmission_image
    default:
      return qbittorrent_image
  }
})

// 按钮点击
function onClose() {
  emit('close')
}

onMounted(async () => {
  if (props.downloader.enabled) {
    await loadDownloaderInfo()
  }
})

onUnmounted(() => {
  if (timeoutTimer) clearTimeout(timeoutTimer)
})
</script>
<template>
  <div>
    <VCard variant="tonal" @click="openDownloaderInfoDialog">
      <DialogCloseBtn @click="onClose" />
      <span class="absolute top-3 right-12">
        <IconBtn>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
      </span>
      <VCardText class="flex justify-space-between align-center gap-4">
        <div class="align-self-start flex-1">
          <div class="flex items-center">
            <VBadge
              v-if="props.downloader.default && props.downloader.enabled"
              dot
              inline
              color="success"
              class="me-1"
            />
            <span class="text-h6">{{ downloader.name }}</span>
          </div>
          <div class="mt-1 flex flex-wrap text-sm" v-if="props.downloader.enabled">
            <span class="me-2">{{ `↑ ${formatFileSize(upload_rate, 1)}/s ` }}</span>
            <span>{{ `↓ ${formatFileSize(download_rate, 1)}/s` }}</span>
          </div>
        </div>
        <div class="h-20">
          <VImg :src="getIcon" cover class="mt-7" max-width="3rem" min-width="3rem" />
        </div>
      </VCardText>
    </VCard>
    <VDialog v-model="downloaderInfoDialog" scrollable max-width="40rem" persistent>
      <VCard :title="`${props.downloader.name} - 配置`" class="rounded-t">
        <DialogCloseBtn v-model="downloaderInfoDialog" />
        <VDivider />
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch v-model="downloaderInfo.enabled" label="启用下载器" />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch v-model="downloaderInfo.default" label="默认下载器" :disabled="!downloaderInfo.enabled" />
              </VCol>
            </VRow>
            <VRow v-if="downloaderInfo.type == 'qbittorrent'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderName"
                  label="名称"
                  placeholder="必填；不可与其他名称重名"
                  hint="下载器的别名"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.host"
                  label="地址"
                  placeholder="http(s)://ip:port"
                  hint="服务端地址，格式：http(s)://ip:port"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.username"
                  label="用户名"
                  placeholder="admin"
                  hint="登录使用的用户名"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.password"
                  type="password"
                  label="密码"
                  hint="登录使用的密码"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderInfo.config.category"
                  label="自动分类管理"
                  hint="由下载器自动管理分类和下载目录"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderInfo.config.sequentail"
                  label="顺序下载"
                  hint="按顺序依次下载文件"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderInfo.config.force_resume"
                  label="强制继续"
                  hint="强制继续、强制上传模式"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderInfo.config.first_last_piece"
                  label="优先首尾文件"
                  hint="优先下载首尾文件块"
                  persistent-hint
                  active
                />
              </VCol>
            </VRow>
            <VRow v-if="downloaderInfo.type == 'transmission'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderName"
                  label="名称"
                  placeholder="必填；不可与其他名称重名"
                  hint="下载器的别名"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.host"
                  label="地址"
                  placeholder="http(s)://ip:port"
                  hint="服务端地址，格式：http(s)://ip:port"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.username"
                  label="用户名"
                  placeholder="admin"
                  hint="登录使用的用户名"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderInfo.config.password"
                  type="password"
                  label="密码"
                  hint="登录使用的密码"
                  persistent-hint
                  active
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardActions class="pt-3">
          <VBtn @click="saveDownloaderInfo" variant="elevated" prepend-icon="mdi-content-save" class="px-5">
            确定
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
