<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import MediaIdSelector from '../misc/MediaIdSelector.vue'
import store from '@/store'
import api from '@/api'
import { numberValidator } from '@/@validators'
import { useDisplay } from 'vuetify'
import ProgressDialog from './ProgressDialog.vue'
import { MediaDirectory } from '@/api/types'

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  path: String,
  target: String,
  logids: Array<number>,
})

// 定义事件
const emit = defineEmits(['done', 'close'])

// 生成1到100季的下拉框选项
const seasonItems = ref(
  Array.from({ length: 101 }, (_, i) => i).map(item => ({
    title: `第 ${item} 季`,
    value: item,
  })),
)

// 当前识别类型
const mediaSource = ref('themoviedb')

// 提示框
const $toast = useToast()

// TMDB选择对话框
const mediaSelectorDialog = ref(false)

// 加载进度SSE
const progressEventSource = ref<EventSource>()

// 整理进度条
const progressDialog = ref(false)

// 整理进度文本
const progressText = ref('请稍候 ...')

// 整理进度
const progressValue = ref(0)

// 文件转移表单
const transferForm = reactive({
  logid: 0,
  path: '',
  target: props.target ?? null,
  tmdbid: null,
  doubanid: null,
  season: null,
  type_name: '',
  transfer_type: '',
  episode_format: '',
  episode_detail: '',
  episode_part: '',
  episode_offset: null,
  min_filesize: 0,
  scrape: false,
})

// 所有媒体库目录
const libraryDirectories = ref<MediaDirectory[]>([])

// 目的目录下拉框
const targetDirectories = computed(() => {
  const directories = libraryDirectories.value.map(item => item.path)
  return [...new Set(directories)]
})

// 监听输入变化
watchEffect(() => {
  transferForm.path = props.path ?? ''
  transferForm.target = props.target ?? null
})

// 监听目的路径变化，自动查询目录的刮削配置
watch(transferForm, async () => {
  if (transferForm.target) {
    const directory = libraryDirectories.value.find(item => item.path === transferForm.target)
    if (directory) {
      transferForm.scrape = directory.scrape ?? false
    }
  }
})

// 使用SSE监听加载进度
function startLoadingProgress() {
  progressText.value = '请稍候 ...'

  const token = store.state.auth.token

  progressEventSource.value = new EventSource(
    `${import.meta.env.VITE_API_BASE_URL}system/progress/filetransfer?token=${token}`,
  )
  progressEventSource.value.onmessage = event => {
    const progress = JSON.parse(event.data)
    if (progress) {
      progressText.value = progress.text
      progressValue.value = progress.value
    }
  }
}

// 停止监听加载进度
function stopLoadingProgress() {
  progressEventSource.value?.close()
}

// 整理文件
// eslint-disable-next-line sonarjs/cognitive-complexity
async function transfer() {
  if (!props.logids && !props.path) return

  // 显示进度条
  progressDialog.value = true
  // 开始监听进度
  startLoadingProgress()

  if (props.path) {
    // 文件整理
    try {
      const result: { [key: string]: any } = await api.post(
        'transfer/manual',
        {},
        {
          params: transferForm,
        },
      )
      // 显示结果
      if (result.success) $toast.success(`${props.path} 整理完成！`)
      else $toast.error(`${props.path} 整理失败：${result.message}！`)
    } catch (e) {
      console.log(e)
    }
  } else if (props.logids) {
    // 日志整理
    for (const logid of props.logids) {
      transferForm.logid = logid
      try {
        const result: { [key: string]: any } = await api.post(
          'transfer/manual',
          {},
          {
            params: transferForm,
          },
        )
        if (!result.success) $toast.error(`历史记录 ${logid} 重新整理失败：${result.message}！`)
      } catch (e) {
        console.log(e)
      }
    }
  }

  // 停止监听进度
  stopLoadingProgress()
  // 关闭进度条
  progressDialog.value = false
  // 重新加载
  emit('done')
}

// 调用API，加载当前系统环境设置
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result) mediaSource.value = result.data?.RECOGNIZE_SOURCE || 'themoviedb'
  } catch (e) {
    console.error(e)
  }
}

// 查询媒体库目录
async function loadLibraryDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/LibraryDirectories')
    if (result.success && result.data?.value) {
      libraryDirectories.value = result.data.value
    }
  } catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  loadSystemSettings()
  loadLibraryDirectories()
})
</script>

<template>
  <VDialog scrollable max-width="50rem" :fullscreen="!display.mdAndUp.value">
    <VCard
      :title="`${props.path ? `整理 - ${props.path}` : `整理 - 共 ${props.logids?.length} 条记录`}`"
      class="rounded-t"
    >
      <DialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12" md="8">
              <VCombobox
                v-model="transferForm.target"
                :items="targetDirectories"
                label="目的路径"
                placeholder="留空自动"
                hint="整理目的路径，留空将自动匹配"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="4">
              <VSelect
                v-model="transferForm.transfer_type"
                label="整理方式"
                :items="[
                  { title: '默认', value: '' },
                  { title: '移动', value: 'move' },
                  { title: '复制', value: 'copy' },
                  { title: '硬链接', value: 'link' },
                  { title: '软链接', value: 'softlink' },
                  { title: 'Rclone复制', value: 'rclone_copy' },
                  { title: 'Rclone移动', value: 'rclone_move' },
                ]"
                hint="文件操作整理方式"
                persistent-hint
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="4">
              <VSelect
                v-model="transferForm.type_name"
                label="类型"
                :items="[
                  { title: '自动', value: '' },
                  { title: '电影', value: '电影' },
                  { title: '电视剧', value: '电视剧' },
                ]"
                hint="文件的媒体类型"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-if="mediaSource === 'themoviedb'"
                v-model="transferForm.tmdbid"
                :disabled="transferForm.type_name === ''"
                label="TheMovieDb编号"
                placeholder="留空自动识别"
                :rules="[numberValidator]"
                append-inner-icon="mdi-magnify"
                hint="按名称查询媒体编号，留空自动识别"
                persistent-hint
                @click:append-inner="mediaSelectorDialog = true"
              />
              <VTextField
                v-else
                v-model="transferForm.doubanid"
                :disabled="transferForm.type_name === ''"
                label="豆瓣编号"
                placeholder="留空自动识别"
                :rules="[numberValidator]"
                append-inner-icon="mdi-magnify"
                hint="按名称查询媒体编号，留空自动识别"
                persistent-hint
                @click:append-inner="mediaSelectorDialog = true"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VSelect
                v-show="transferForm.type_name === '电视剧'"
                v-model.number="transferForm.season"
                label="季"
                :items="seasonItems"
                hint="指定季数"
                persistent-hint
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="8">
              <VTextField
                v-model="transferForm.episode_format"
                label="集数定位"
                placeholder="使用{ep}定位集数"
                hint="使用{ep}定位文件名中的集数部分以辅助识别"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="transferForm.episode_detail"
                label="指定集数"
                placeholder="起始集,终止集，如1或1,2"
                hint="指定集数或范围，如1或1,2"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="transferForm.episode_part"
                label="指定Part"
                placeholder="如part1"
                hint="指定Part，如part1"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model.number="transferForm.episode_offset"
                label="集数偏移"
                placeholder="如-10"
                hint="集数偏移运算，如-10或EP*2"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model.number="transferForm.min_filesize"
                label="最小文件大小（MB）"
                :rules="[numberValidator]"
                placeholder="0"
                hint="只整理大于最小文件大小的文件"
                persistent-hint
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="transferForm.scrape"
                label="刮削元数据"
                hint="整理完成后自动刮削元数据"
                persistent-hint
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="pt-3">
        <VSpacer />
        <VBtn variant="elevated" @click="transfer" prepend-icon="mdi-arrow-right-bold" class="px-5"> 开始整理 </VBtn>
      </VCardActions>
    </VCard>
    <!-- 手动整理进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" :value="progressValue" />
    <!-- TMDB ID搜索框 -->
    <VDialog v-model="mediaSelectorDialog" width="40rem" scrollable max-height="85vh">
      <MediaIdSelector
        v-if="mediaSource === 'themoviedb'"
        v-model="transferForm.tmdbid"
        @close="mediaSelectorDialog = false"
        :type="mediaSource"
      />
      <MediaIdSelector
        v-else
        v-model="transferForm.doubanid"
        @close="mediaSelectorDialog = false"
        :type="mediaSource"
      />
    </VDialog>
  </VDialog>
</template>
