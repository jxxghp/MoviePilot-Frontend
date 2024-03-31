<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { VRow } from 'vuetify/lib/components/index.mjs'
import api from '@/api'
import { requiredValidator } from '@/@validators'

// 选中的媒体服务器
const selectedMediaServers = ref([])

// 选中的下载器
const selectedDownloaders = ref([])

// 下载器选中标签页
const downloaderTab = ref('qbittorrent')

// 媒体服务器选中标签页
const mediaserverTab = ref('emby')

// 媒体库设置项
const mediaSettings = ref({
  SCRAP_METADATA: true,
  DOWNLOAD_PATH: '',
  DOWNLOAD_MOVIE_PATH: '',
  DOWNLOAD_TV_PATH: '',
  DOWNLOAD_ANIME_PATH: '',
  DOWNLOAD_CATEGORY: false,
  TRANSFER_TYPE: 'copy',
  OVERWRITE_MODE: 'size',
  LIBRARY_PATH: '',
  LIBRARY_MOVIE_NAME: '',
  LIBRARY_TV_NAME: '',
  LIBRARY_ANIME_NAME: '',
  LIBRARY_CATEGORY: false,
})

// 下载器设置项
const downloaderSettings = ref({
  DOWNLOADER_MONITOR: true,
  TORRENT_TAG: '',
  QB_HOST: '',
  QB_USER: '',
  QB_PASSWORD: '',
  QB_CATEGORY: false,
  QB_SEQUENTIAL: false,
  QB_FORCE_RESUME: false,
  TR_HOST: '',
  TR_USER: '',
  TR_PASSWORD: '',
})

// 媒体服务器设置项
const mediaServerSettings = ref({
  MEDIASERVER_SYNC_INTERVAL: 6,
  MEDIASERVER_SYNC_BLACKLIST: '',
  EMBY_HOST: '',
  EMBY_PLAY_HOST: '',
  EMBY_API_KEY: '',
  JELLYFIN_HOST: '',
  JELLYFIN_PLAY_HOST: '',
  JELLYFIN_API_KEY: '',
  PLEX_HOST: '',
  PLEX_PLAY_HOST: '',
  PLEX_TOKEN: '',
})

// 下载器字典项
const Downloaders = [
  {
    title: 'Qbittorrent',
    value: 'qbittorrent',
  },
  {
    title: 'Transmission',
    value: 'transmission',
  },
]

// 媒体服务器字典项
const MediaServers = [
  {
    title: 'Emby',
    value: 'emby',
  },
  {
    title: 'Jellyfin',
    value: 'jellyfin',
  },
  {
    title: 'Plex',
    value: 'plex',
  },
]

// 转移方式字典
const transferTypeItems = [
  { title: '硬链接', value: 'link' },
  { title: '复制', value: 'copy' },
  { title: '移动', value: 'move' },
  { title: '软链接', value: 'softlink' },
  { title: 'rclone复制', value: 'rclone_copy' },
  { title: 'rclone移动', value: 'rclone_move' },
]

// 覆盖模式字典
const overwriteModeItems = [
  { title: '从不覆盖', value: 'never' },
  { title: '按大小覆盖', value: 'size' },
  { title: '总是覆盖', value: 'always' },
  { title: '仅保留最新版本', value: 'latest' },
]

// 媒体库同步周期字典
const syncIntervalItems = [
  { title: '从不', value: 0 },
  { title: '每小时', value: 1 },
  { title: '每6小时', value: 6 },
  { title: '每12小时', value: 12 },
  { title: '每天', value: 24 },
  { title: '每周', value: 168 },
]

// 提示框
const $toast = useToast()

// 加载媒体库设置
async function loadMediaSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      const {
        SCRAP_METADATA,
        DOWNLOAD_PATH,
        DOWNLOAD_MOVIE_PATH,
        DOWNLOAD_TV_PATH,
        DOWNLOAD_ANIME_PATH,
        DOWNLOAD_CATEGORY,
        TRANSFER_TYPE,
        OVERWRITE_MODE,
        LIBRARY_PATH,
        LIBRARY_MOVIE_NAME,
        LIBRARY_TV_NAME,
        LIBRARY_ANIME_NAME,
        LIBRARY_CATEGORY,
      } = result.data
      mediaSettings.value = {
        SCRAP_METADATA,
        DOWNLOAD_PATH,
        DOWNLOAD_MOVIE_PATH,
        DOWNLOAD_TV_PATH,
        DOWNLOAD_ANIME_PATH,
        DOWNLOAD_CATEGORY,
        TRANSFER_TYPE,
        OVERWRITE_MODE,
        LIBRARY_PATH,
        LIBRARY_MOVIE_NAME,
        LIBRARY_TV_NAME,
        LIBRARY_ANIME_NAME,
        LIBRARY_CATEGORY,
      }
    }
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API保存媒体设置
async function saveMediaSetting() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/env',
      mediaSettings.value,
    )

    if (result.success)
      $toast.success('保存媒体库设置成功')
    else
      $toast.error('保存媒体库设置失败！')
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API查询下载器设置
async function loadDownloaderSetting() {
  try {
    const result1: { [key: string]: any } = await api.get('system/setting/DOWNLOADER')
    if (result1.success)
      selectedDownloaders.value = result1.data?.value?.split(',')

    const result2: { [key: string]: any } = await api.get('system/env')
    if (result2.success) {
      const {
        DOWNLOADER_MONITOR,
        TORRENT_TAG,
        QB_HOST,
        QB_USER,
        QB_PASSWORD,
        QB_CATEGORY,
        QB_SEQUENTIAL,
        QB_FORCE_RESUME,
        TR_HOST,
        TR_USER,
        TR_PASSWORD,
      } = result2.data
      downloaderSettings.value = {
        DOWNLOADER_MONITOR,
        TORRENT_TAG,
        QB_HOST,
        QB_USER,
        QB_PASSWORD,
        QB_CATEGORY,
        QB_SEQUENTIAL,
        QB_FORCE_RESUME,
        TR_HOST,
        TR_USER,
        TR_PASSWORD,
      }
    }
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API保存下载器设置
async function saveDownloaderSetting() {
  try {
    const result1: { [key: string]: any } = await api.post(
      'system/setting/DOWNLOADER',
      selectedDownloaders.value.join(','),
    )
    const result2: { [key: string]: any } = await api.post(
      'system/env',
      downloaderSettings.value,
    )

    if (result1.success && result2.success) {
      $toast.success('保存下载器设置成功')
      reloadModule()
    }
    else { $toast.error('保存下载器设置失败！') }
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API查询媒体服务器设置
async function loadMediaServerSetting() {
  try {
    const result1: { [key: string]: any } = await api.get('system/setting/MEDIASERVER')
    if (result1.success)
      selectedMediaServers.value = result1.data?.value?.split(',')

    const result2: { [key: string]: any } = await api.get('system/env')
    if (result2.success) {
      const {
        MEDIASERVER_SYNC_INTERVAL,
        MEDIASERVER_SYNC_BLACKLIST,
        EMBY_HOST,
        EMBY_PLAY_HOST,
        EMBY_API_KEY,
        JELLYFIN_HOST,
        JELLYFIN_PLAY_HOST,
        JELLYFIN_API_KEY,
        PLEX_HOST,
        PLEX_PLAY_HOST,
        PLEX_TOKEN,
      } = result2.data
      mediaServerSettings.value = {
        MEDIASERVER_SYNC_INTERVAL,
        MEDIASERVER_SYNC_BLACKLIST,
        EMBY_HOST,
        EMBY_PLAY_HOST,
        EMBY_API_KEY,
        JELLYFIN_HOST,
        JELLYFIN_PLAY_HOST,
        JELLYFIN_API_KEY,
        PLEX_HOST,
        PLEX_PLAY_HOST,
        PLEX_TOKEN,
      }
    }
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API保存媒体服务器设置
async function saveMediaServerSetting() {
  try {
    const result1: { [key: string]: any } = await api.post(
      'system/setting/MEDIASERVER',
      selectedMediaServers.value.join(','),
    )

    const result2: { [key: string]: any } = await api.post(
      'system/env',
      mediaServerSettings.value,
    )

    if (result1.success && result2.success) {
      $toast.success('保存媒体服务器设置成功')
      reloadModule()
    }
    else { $toast.error('保存媒体服务器设置失败！') }
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API接口重新加载模块
async function reloadModule() {
  try {
    const result: { [key: string]: any } = await api.get('system/reload')
    if (result.success)
      $toast.success('重新加载模块成功')
    else
      $toast.error('重新加载模块失败！')
  }
  catch (error) {
    console.log(error)
  }
}

// 加载数据
onMounted(() => {
  loadDownloaderSetting()
  loadMediaServerSetting()
  loadMediaSettings()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="下载器">
        <VCardSubtitle>只有选中的第1个下载器才会被默认使用。</VCardSubtitle>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedDownloaders"
                  multiple
                  chips
                  :items="Downloaders"
                  label="当前使用下载器"
                  hint="MoviePilot自动添加的下载任务将使用选中的第1个下载器"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="downloaderSettings.TORRENT_TAG"
                  label="下载器种子标签"
                  hint="设置种子标签用于区分MoviePilot添加的下载任务，默认标签为`MOVIEPILOT`"
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderSettings.DOWNLOADER_MONITOR"
                  label="监控默认下载器"
                  hint="监控选中的第1个下载器，当任务下载完成时自动整理文件到媒体库"
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol>
                <VTabs
                  v-model="downloaderTab"
                  stacked
                >
                  <VTab value="qbittorrent">
                    Qbittorrent
                  </VTab>
                  <VTab value="transmission">
                    Transmission
                  </VTab>
                </VTabs>
                <VWindow
                  v-model="downloaderTab"
                  class="mt-5 disable-tab-transition"
                  :touch="false"
                >
                  <VWindowItem value="qbittorrent">
                    <VForm>
                      <VRow>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="downloaderSettings.QB_HOST"
                            label="地址"
                            placeholder="IP:PORT"
                            hint="格式：IP:PORT，如启用了HTTPS，请使用https://IP:PORT"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="downloaderSettings.QB_USER"
                            label="用户名"
                            placeholder="admin"
                            hint="QB的登录用户名"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="downloaderSettings.QB_PASSWORD"
                            type="password"
                            label="密码"
                            hint="QB的登录密码"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VSwitch
                            v-model="downloaderSettings.QB_CATEGORY"
                            label="自动分类管理"
                            hint="开启后，下载目录将由QB控制自动下载到分类到目录，此时MoviePilot的下载目录设定无效，需在QB中提前创建分类"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VSwitch
                            v-model="downloaderSettings.QB_SEQUENTIAL"
                            label="顺序下载"
                            hint="开启后QB将按照文件顺序依次下载"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VSwitch
                            v-model="downloaderSettings.QB_FORCE_RESUME"
                            label="强制继续"
                            hint="开启后，QB将设置为强制继续、强制上传模式（带[F]标识）"
                          />
                        </VCol>
                      </VRow>
                    </VForm>
                  </VWindowItem>
                  <VWindowItem value="transmission">
                    <VForm>
                      <VRow>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="downloaderSettings.TR_HOST"
                            label="地址"
                            placeholder="IP:PORT"
                            hint="格式：IP:PORT，如启用了HTTPS，请使用https://IP:PORT"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="downloaderSettings.TR_USER"
                            label="用户名"
                            placeholder="admin"
                            hint="TR的登录用户名"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="downloaderSettings.TR_PASSWORD"
                            type="password"
                            label="密码"
                            hint="TR的登录密码"
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
              <VBtn
                mtype="submit"
                @click="saveDownloaderSetting"
              >
                保存
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard title="媒体服务器">
        <VCardSubtitle>只有选中的媒体服务器才会被默认使用。</VCardSubtitle>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="4">
                <VSelect
                  v-model="selectedMediaServers"
                  multiple
                  chips
                  :items="MediaServers"
                  label="当前使用媒体服务器"
                  hint="媒体服务器用于搜索下载等判断库中是否已存在，以避免重复下载"
                />
              </VCol>
              <VCol cols="12" md="4">
                <VSelect
                  v-model="mediaServerSettings.MEDIASERVER_SYNC_INTERVAL"
                  :items="syncIntervalItems"
                  label="同步周期"
                  hint="设置后数据将定时同步到MoviePilot数据库，以便展示媒体库是否存在标识"
                />
              </VCol>
              <VCol cols="12" md="4">
                <VTextField
                  v-model="mediaServerSettings.MEDIASERVER_SYNC_BLACKLIST"
                  label="媒体库同步黑名单"
                  placeholder="使用,分隔"
                  hint="设置不同步数据的媒体库名称，使用,分隔，如：电影,电视剧"
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol>
                <VTabs
                  v-model="mediaserverTab"
                  stacked
                >
                  <VTab value="emby">
                    Emby
                  </VTab>
                  <VTab value="jellyfin">
                    Jellyfin
                  </VTab>
                  <VTab value="plex">
                    Plex
                  </vtab>
                </VTabs>
                <VWindow
                  v-model="mediaserverTab"
                  class="mt-5 disable-tab-transition"
                  :touch="false"
                >
                  <VWindowItem value="emby">
                    <VForm>
                      <VRow>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="mediaServerSettings.EMBY_HOST"
                            label="地址"
                            placeholder="IP:PORT"
                            hint="格式：IP:PORT 或 http(s)://IP:PORT/"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="mediaServerSettings.EMBY_PLAY_HOST"
                            label="外网播放地址"
                            placeholder="http(s)://domain:port"
                            hint="格式：http(s)://domain:port，设置后跳转Emby时将优先使用此地址"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="mediaServerSettings.EMBY_API_KEY"
                            label="API密钥"
                            hint="Emby的API密钥，在 Emby设置->高级->API 密钥 中生成"
                          />
                        </VCol>
                      </VRow>
                    </VForm>
                  </VWindowItem>
                  <VWindowItem value="jellyfin">
                    <VForm>
                      <VRow>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="mediaServerSettings.JELLYFIN_HOST"
                            label="地址"
                            placeholder="IP:PORT"
                            hint="格式：IP:PORT 或 http(s)://IP:PORT/"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="mediaServerSettings.JELLYFIN_PLAY_HOST"
                            label="外网播放地址"
                            placeholder="http(s)://domain:port"
                            hint="格式：http(s)://domain:port，设置后跳转Jellyfin时将优先使用此地址"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="mediaServerSettings.JELLYFIN_API_KEY"
                            label="API密钥"
                            hint="Jellyfin的API密钥，在 Jellyfin设置->高级->API 密钥 中生成"
                          />
                        </VCol>
                      </VRow>
                    </VForm>
                  </VWindowItem>
                  <VWindowItem value="plex">
                    <VForm>
                      <VRow>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="mediaServerSettings.PLEX_HOST"
                            label="地址"
                            placeholder="IP:PORT"
                            hint="格式：IP:PORT 或 http(s)://IP:PORT/"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="mediaServerSettings.PLEX_PLAY_HOST"
                            label="外网播放地址"
                            placeholder="http(s)://domain:port"
                            hint="格式：http(s)://domain:port，设置后跳转Plex时将优先使用此地址"
                          />
                        </VCol>
                        <VCol cols="12" md="4">
                          <VTextField
                            v-model="mediaServerSettings.PLEX_TOKEN"
                            label="API密钥"
                            hint="Plex网页Url中的X-Plex-Token，通过浏览器F12->网络从请求URL中获取"
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
              <VBtn
                mtype="submit"
                @click="saveMediaServerSetting"
              >
                保存
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard title="媒体库">
        <VCardSubtitle>设置下载目录、媒体库目录以及整理方式。</VCardSubtitle>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaSettings.DOWNLOAD_PATH"
                  label="下载目录"
                  :rules="[requiredValidator]"
                  hint="MoviePilot添加的下载任务的默认保存目录，必须设置"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaSettings.DOWNLOAD_MOVIE_PATH"
                  label="电影下载目录"
                  hint="为电影设置单独的下载保存目录，不设置则使用下载目录"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaSettings.DOWNLOAD_TV_PATH"
                  label="电视剧下载目录"
                  hint="为电视剧设置单独的下载保存目录，不设置则使用下载目录"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaSettings.DOWNLOAD_ANIME_PATH"
                  label="动漫下载目录"
                  hint="为动漫设置单独的下载保存目录，不设置则使用下载目录"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="mediaSettings.DOWNLOAD_CATEGORY"
                  label="下载目录自动分类"
                  hint="开启后，下载任务保存目录将根据二级分类策略自动分类存放到下载目录的二级子目录中，二级分类策略需要编辑配置文件目录下的`category.yml`文件，插件市场有提供文件编辑插件"
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="mediaSettings.TRANSFER_TYPE"
                  :items="transferTypeItems"
                  label="整理方式"
                  hint="硬链接需要确保下载目录和媒体库目录不跨盘、不跨共享目录、不分别映射；rclone需要手动在容器中完成配置，且配置名为：`MP`"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="mediaSettings.OVERWRITE_MODE"
                  :items="overwriteModeItems"
                  label="覆盖模式"
                  hint="从不覆盖：不覆盖已存在的文件；按大小覆盖：大文件将覆盖小文件；总是覆盖：总是覆盖已存在的文件；仅保留最新版本：保留最新版本的文件，删除其它版本的文件"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="mediaSettings.SCRAP_METADATA"
                  label="自动刮削媒体信息"
                  hint="开启后，整理完成后将自动刮削媒体信息，如海报、简介等"
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaSettings.LIBRARY_PATH"
                  label="媒体库目录"
                  placeholder="多个目录使用,分隔"
                  :rules="[requiredValidator]"
                  hint="整理完成后的媒体文件存放的根目录，所有整理场景下未设定目的目录时都将整理到该目录下，必须设置"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaSettings.LIBRARY_MOVIE_NAME"
                  label="电影目录名称"
                  placeholder="电影"
                  hint="设置电影的存放一级目录名称，不设置则使用使用`电影`做为目录名称"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaSettings.LIBRARY_TV_NAME"
                  label="电视剧目录名称"
                  placeholder="电视剧"
                  hint="设置电视剧的存放一级目录名称，不设置则使用使用`电视剧`做为目录名称"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaSettings.LIBRARY_ANIME_NAME"
                  label="动漫目录名称"
                  placeholder="动漫"
                  hint="设置动漫的存放一级目录名称，不设置则使用使用`动漫`做为目录名称"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="mediaSettings.LIBRARY_CATEGORY"
                  label="媒体库目录自动分类"
                  hint="开启后，整理完成后的媒体文件将根据二级分类策略自动分类存放到媒体库一级目录的二级子目录中，二级分类策略需要编辑配置文件目录下的`category.yml`文件，插件市场有提供文件编辑插件"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn
                mtype="submit"
                @click="saveMediaSetting"
              >
                保存
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
