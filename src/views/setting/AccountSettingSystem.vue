<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { VRow } from 'vuetify/lib/components/index.mjs'
import draggable from 'vuedraggable'
import api from '@/api'
import { DownloaderConf, MediaServerConf } from '@/api/types'
import DownloaderCard from '@/components/cards/DownloaderCard.vue'
import MediaServerCard from '@/components/cards/MediaServerCard.vue'
import { copyToClipboard } from '@/@core/utils/navigator'

// 系统设置项
const SystemSettings = ref<any>({
  // 基础设置
  Basic: {
    APP_DOMAIN: null,
    API_TOKEN: null,
    WALLPAPER: 'tmdb',
    MEDIASERVER_SYNC_INTERVAL: null,
    RECOGNIZE_SOURCE: 'themoviedb',
    GITHUB_TOKEN: null,
    OCR_HOST: null,
  },
  // 高级系统设置
  Advanced: {
    // 全局
    AUXILIARY_AUTH_ENABLE: false,
    GLOBAL_IMAGE_CACHE: false,
    BIG_MEMORY_MODE: false,
    DB_WAL_ENABLE: false,
    // 媒体
    TMDB_API_DOMAIN: null,
    TMDB_IMAGE_DOMAIN: null,
    META_CACHE_EXPIRE: 0,
    FANART_ENABLE: false,
    SCRAP_FOLLOW_TMDB: true,
    SUBSCRIBE_STATISTIC_SHARE: true,
    PLUGIN_STATISTIC_SHARE: true,
    // 网络
    PROXY_HOST: null,
    GITHUB_PROXY: null,
    PIP_PROXY: null,
    DOH_ENABLE: false,
    DOH_RESOLVERS: null,
    DOH_DOMAINS: null,
    // 开发
    DEBUG: false,
    PLUGIN_AUTO_RELOAD: false,
  },
})

// 是否发送请求的总开关
const isRequest = ref(true)

// 选中的媒体服务器
const mediaServers = ref<MediaServerConf[]>([])

// 下载器
const downloaders = ref<DownloaderConf[]>([])

// 提示框
const $toast = useToast()

// 高级设置对话框
const advancedDialog = ref(false)

const activeTab = ref('system')

// 调用API查询下载器设置
async function loadDownloaderSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Downloaders')
    downloaders.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 重载系统生效配置
async function reloadSystem() {
  try {
    const result: { [key: string]: any } = await api.get('system/reload')
    if (result.success) $toast.success('系统配置已生效')
    else $toast.error('重载系统失败！')
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存下载器设置
async function saveDownloaderSetting() {
  try {
    // 提取启用的下载器
    const enabledDownloaders = downloaders.value.filter(item => item.enabled)
    // 有启动的下载器时
    if (enabledDownloaders.length > 0) {
      downloaders.value = handleDefaultDownloaders(enabledDownloaders, downloaders.value)
    }
    const result: { [key: string]: any } = await api.post('system/setting/Downloaders', downloaders.value)
    if (result.success) $toast.success('下载器设置保存成功')
    else $toast.error('下载器设置保存失败！')

    await loadDownloaderSetting()
    await reloadSystem()
  } catch (error) {
    console.log(error)
  }
}

// 处理默认下载器状态
function handleDefaultDownloaders(enabledDownloaders: any[], downloaders: any[]) {
  const enabledDefaultDownloader = enabledDownloaders.find(item => item.default)
  if (enabledDownloaders.length > 0 && !enabledDefaultDownloader) {
    downloaders = downloaders.map(item => {
      if (item === enabledDownloaders[0]) {
        $toast.info(`未设置默认下载器，已将【${item.name}】作为默认下载器`)
        return { ...item, default: true }
      }
      // 清除其他下载器的默认下载器状态
      return { ...item, default: false }
    })
  }
  return downloaders
}

// 调用API查询媒体服务器设置
async function loadMediaServerSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/MediaServers')
    mediaServers.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存媒体服务器设置
async function saveMediaServerSetting() {
  try {
    const result: { [key: string]: any } = await api.post('system/setting/MediaServers', mediaServers.value)
    if (result.success) $toast.success('媒体服务器设置保存成功')
    else $toast.error('媒体服务器设置保存失败！')

    await loadMediaServerSetting()
    await reloadSystem()
  } catch (error) {
    console.log(error)
  }
}

// 加载系统设置
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      // 将API返回的值赋值给SystemSettings
      for (const sectionKey of Object.keys(SystemSettings.value) as Array<keyof typeof SystemSettings.value>) {
        Object.keys(SystemSettings.value[sectionKey]).forEach((key: string) => {
          if (result.data.hasOwnProperty(key)) (SystemSettings.value[sectionKey] as any)[key] = result.data[key]
        })
      }
    }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存设置
async function saveSystemSetting(value: { [key: string]: any }) {
  try {
    const result: { [key: string]: any } = await api.post('system/env', value)
    if (result.success) {
      return true
    }
  } catch (error) {
    console.log(error)
  }
  return false
}

// 保存基础设置
async function saveBasicSettings() {
  if (await saveSystemSetting(SystemSettings.value.Basic)) {
    $toast.success('基础设置保存成功')
    await reloadSystem()
  } else {
    $toast.error('基础设置保存失败！')
  }
}

// 高级设置变化，等待保存
async function saveAdvancedSettings() {
  if (await saveSystemSetting(SystemSettings.value.Advanced)) {
    advancedDialog.value = false
    $toast.success('高级设置保存成功')
    await reloadSystem()
  } else {
    $toast.error('高级设置保存失败！')
  }
}

// 快捷复制到剪贴板
function copyValue(value: string) {
  try {
    copyToClipboard(value)
    $toast.success('已复制到剪贴板')
  } catch (error) {
    $toast.error('复制失败！')
    console.log(error)
  }
}

// 登录首页壁纸来源
const wallpaperItems = [
  { title: 'TheMovieDB电影海报', value: 'tmdb' },
  { title: 'Bing每日壁纸', value: 'bing' },
  { title: '媒体库海报', value: 'mediaserver' },
]

// 预设部分Github加速站
const githubMirrorsItems = [
  'https://mirror.ghproxy.com/', // GitHub Proxy
  'https://ghp.ci/', // GitHub Proxy 子站
]

// 预设部分PIP镜像站
const pipMirrorsItems = [
  'https://pypi.tuna.tsinghua.edu.cn/simple', // 清华大学
  'https://pypi.mirrors.ustc.edu.cn/simple', // 中国科技大学
  'https://mirrors.pku.edu.cn/pypi/web/simple', // 北京大学
  'https://mirrors.aliyun.com/pypi/simple', // 阿里云
  'https://mirrors.cloud.tencent.com/pypi/simple', // 腾讯云
  'https://mirrors.163.com/pypi/simple', // 网易云
  'https://pypi.doubanio.com/simple', // 豆瓣
  'https://mirrors.hust.edu.cn/pypi/web/simple', // 华中理工大学
  'https://mirrors.bfsu.edu.cn/pypi/web/simple', // 北京外国语大学
]

// 创建随机字符串
function createRandomString() {
  const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_'
  const array = new Uint8Array(32)
  window.crypto.getRandomValues(array)
  SystemSettings.value.Basic.API_TOKEN = Array.from(array, byte => charset[byte % charset.length]).join('')
}

// 添加下载器
function addDownloader(downloader: string) {
  let name = `下载器${downloaders.value.length + 1}`
  while (downloaders.value.some(item => item.name === name)) {
    name = `下载器${parseInt(name.split('下载器')[1]) + 1}`
  }
  downloaders.value.push({
    name: name,
    type: downloader,
    default: false,
    enabled: false,
    config: {},
  })
}

// 删除下载器
function removeDownloader(ele: DownloaderConf) {
  const index = downloaders.value.indexOf(ele)
  downloaders.value.splice(index, 1)
}

// 下载器变化
function onDownloaderChange(downloader: DownloaderConf, name: string) {
  const index = downloaders.value.findIndex(item => item.name === name)
  if (index !== -1) downloaders.value[index] = downloader
}

// 添加媒体服务器
function addMediaServer(mediaserver: string) {
  let name = `服务器${mediaServers.value.length + 1}`
  while (mediaServers.value.some(item => item.name === name)) {
    name = `服务器${parseInt(name.split('服务器')[1]) + 1}`
  }
  mediaServers.value.push({
    name: name,
    type: mediaserver,
    enabled: false,
    config: {},
  })
}

// 删除媒体服务器
function removeMediaServer(ele: MediaServerConf) {
  const index = mediaServers.value.indexOf(ele)
  if (index !== -1) mediaServers.value.splice(index, 1)
}

// 变更媒体服务器
function onMediaServerChange(mediaserver: MediaServerConf, name: string) {
  const index = mediaServers.value.findIndex(item => item.name === name)
  if (index !== -1) mediaServers.value[index] = mediaserver
}

// 加载数据
onMounted(() => {
  loadDownloaderSetting()
  loadMediaServerSetting()
  loadSystemSettings()
})

onActivated(async () => {
  isRequest.value = true
})

onDeactivated(() => {
  isRequest.value = false
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>基础设置</VCardTitle>
          <VCardSubtitle>设置服务器的全局功能。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.APP_DOMAIN"
                  label="访问域名"
                  placeholder="格式：http(s)://domain:port"
                  hint="用于发送通知时，添加快捷跳转地址"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="3">
                <VSelect
                  v-model="SystemSettings.Basic.WALLPAPER"
                  label="登录首页壁纸"
                  hint="选择登陆页面背景来源"
                  persistent-hint
                  :items="wallpaperItems"
                />
              </VCol>

              <VCol cols="12" md="3">
                <VTextField
                  v-model="SystemSettings.Basic.MEDIASERVER_SYNC_INTERVAL"
                  label="媒体服务器同步间隔"
                  hint="定时同步媒体服务器数据到本地的时间间隔"
                  persistent-hint
                  suffix="小时"
                  type="number"
                  min="1"
                  :rules="[
                    (v: any) => !!v || '必选项，请勿留空',
                    (v: any) => !isNaN(v) || '仅支持输入数字，请勿输入其他字符',
                    (v: any) => v >= 1 || '间隔不能小于1个小时',
                  ]"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.API_TOKEN"
                  label="API令牌"
                  hint="设置外部请求MoviePilot API时使用的token值"
                  placeholder="不能小于16位字符"
                  persistent-hint
                  prependInnerIcon="mdi-reload"
                  :appendInnerIcon="SystemSettings.Basic.API_TOKEN ? 'mdi-content-copy' : ''"
                  @click:prependInner="createRandomString"
                  @click:appendInner="copyValue(SystemSettings.Basic.API_TOKEN)"
                  :rules="[(v: string) => !!v || '必填项；请输入API Token', (v: string) => v.length >= 16 || 'API Token不得低于16位']"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.GITHUB_TOKEN"
                  label="Github Token"
                  placeholder="ghp_**** 或 github_pat_****"
                  hint="用于提高插件等访问Github API时的限流阈值"
                  persistent-hint
                >
                </VTextField>
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.OCR_HOST"
                  label="验证码识别服务器"
                  placeholder="https://movie-pilot.org"
                  hint="用于站点签到、更新站点Cookie等识别验证码"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveBasicSettings"> 保存 </VBtn>
              <VSpacer />
              <VBtn color="warning" @click="advancedDialog = true" append-icon="mdi-dots-horizontal"> 高级设置 </VBtn>
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
          <VCardTitle>下载器</VCardTitle>
          <VCardSubtitle>只有默认下载器才会被默认使用。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="downloaders"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
          >
            <template #item="{ element }">
              <DownloaderCard
                :downloader="element"
                :downloaders="downloaders"
                @close="removeDownloader(element)"
                @change="onDownloaderChange"
                :allow-refresh="isRequest"
              />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveDownloaderSetting"> 保存 </VBtn>
              <VBtn color="success" variant="tonal">
                <VIcon icon="mdi-plus" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <VListItem variant="plain" @click="addDownloader('qbittorrent')">
                      <VListItemTitle>Qbittorrent</VListItemTitle>
                    </VListItem>
                    <VListItem variant="plain" @click="addDownloader('transmission')">
                      <VListItemTitle>Transmission</VListItemTitle>
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
          <VCardTitle>媒体服务器</VCardTitle>
          <VCardSubtitle>所有启用的媒体服务器都会被使用。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="mediaServers"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
          >
            <template #item="{ element }">
              <MediaServerCard
                :mediaserver="element"
                :mediaservers="mediaServers"
                @close="removeMediaServer(element)"
                @change="onMediaServerChange"
              />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveMediaServerSetting"> 保存 </VBtn>
              <VBtn color="success" variant="tonal">
                <VIcon icon="mdi-plus" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <VListItem variant="plain" @click="addMediaServer('emby')">
                      <VListItemTitle>Emby</VListItemTitle>
                    </VListItem>
                    <VListItem variant="plain" @click="addMediaServer('jellyfin')">
                      <VListItemTitle>Jellyfin</VListItemTitle>
                    </VListItem>
                    <VListItem variant="plain" @click="addMediaServer('plex')">
                      <VListItemTitle>Plex</VListItemTitle>
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
  <!-- 高级系统设置 -->
  <VDialog v-if="advancedDialog" v-model="advancedDialog" scrollable max-width="60rem" persistent>
    <VCard>
      <VCardItem>
        <DialogCloseBtn @click="advancedDialog = false" />
        <VCardTitle>高级设置</VCardTitle>
        <VCardSubtitle>系统进阶设置，特殊情况下才需要调整</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <VTabs v-model="activeTab" show-arrows>
          <VTab value="system">
            <div>系统</div>
          </VTab>
          <VTab value="media">
            <div>媒体</div>
          </VTab>
          <VTab value="network">
            <div>网络</div>
          </VTab>
          <VTab value="dev">
            <div>实验室</div>
          </VTab>
        </VTabs>
        <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
          <VWindowItem value="system">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.AUXILIARY_AUTH_ENABLE"
                    label="用户辅助认证"
                    hint="允许外部服务进行登录认证以及自动创建用户"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.GLOBAL_IMAGE_CACHE"
                    label="全局图片缓存"
                    hint="将媒体图片缓存到本地，提升图片加载速度"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.SUBSCRIBE_STATISTIC_SHARE"
                    label="分享订阅数据"
                    hint="分享订阅统计数据到热门订阅，供其他MPer参考"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.PLUGIN_STATISTIC_SHARE"
                    label="上报插件安装数据"
                    hint="上报插件安装数据给服务器，用于统计展示插件安装情况"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.BIG_MEMORY_MODE"
                    label="大内存模式"
                    hint="使用更大的内存缓存数据，提升系统性能"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.DB_WAL_ENABLE"
                    label="WAL模式"
                    hint="可提升读写并发性能，但可能在异常情况下增加数据丢失风险，更改后需重启生效"
                    persistent-hint
                  />
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
          <VWindowItem value="media">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VCombobox
                    v-model="SystemSettings.Advanced.TMDB_API_DOMAIN"
                    label="TMDB API服务地址"
                    placeholder="api.themoviedb.org"
                    hint="自定义themoviedb API域名或代理地址"
                    persistent-hint
                    :items="['api.themoviedb.org']"
                    :rules="[(v: string) => !!v || '请输入TMDB API域名']"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VCombobox
                    v-model="SystemSettings.Advanced.TMDB_IMAGE_DOMAIN"
                    label="TMDB 图片服务地址"
                    placeholder="image.tmdb.org"
                    hint="自定义themoviedb图片服务域名或代理地址"
                    persistent-hint
                    :items="['image.tmdb.org', 'static-mdb.v.geilijiasu.com']"
                    :rules="[(v: string) => !!v || '请输入图片服务域名']"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="SystemSettings.Advanced.META_CACHE_EXPIRE"
                    label="媒体元数据缓存过期时间"
                    hint="识别元数据本地缓存时间，为 0 时使用内置默认值"
                    persistent-hint
                    min="0"
                    type="number"
                    suffix="小时"
                    :rules="[(v: any) => v === 0 || !!v || '请输入元数据缓存时间', (v: any) => v >= 0 || '元数据缓存时间必须大于等于0']"
                  />
                </VCol>
              </VRow>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.SCRAP_FOLLOW_TMDB"
                    label="跟随TMDB识别整理"
                    hint="关闭时以整理历史记录为准（如有），避免TMDB数据在订阅中途修改"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.FANART_ENABLE"
                    label="Fanart图片数据源"
                    hint="使用 fanart.tv 的图片数据"
                    persistent-hint
                  />
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
          <VWindowItem value="network">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VCombobox
                    v-model="SystemSettings.Advanced.GITHUB_PROXY"
                    label="Github加速代理"
                    placeholder="https://mirror.ghproxy.com/"
                    hint="使用代理加速Github访问速度"
                    persistent-hint
                    :items="githubMirrorsItems"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VCombobox
                    v-model="SystemSettings.Advanced.PIP_PROXY"
                    label="PIP加速代理"
                    placeholder="https://pypi.tuna.tsinghua.edu.cn/simple"
                    hint="使用代理加速插件等pip库安装速度"
                    persistent-hint
                    :items="pipMirrorsItems"
                  />
                </VCol>
              </VRow>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.DOH_ENABLE"
                    label="DNS Over HTTPS"
                    hint="使用DOH对特定域名进行解析，以防止DNS污染"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" v-show="SystemSettings.Advanced.DOH_ENABLE">
                  <VTextarea
                    v-model="SystemSettings.Advanced.DOH_RESOLVERS"
                    label="DOH 服务器"
                    placeholder="https://dns.google/dns-query,1.1.1.1"
                    hint="DNS解析服务器地址，多个地址使用逗号分隔"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" v-show="SystemSettings.Advanced.DOH_ENABLE">
                  <VTextarea
                    v-model="SystemSettings.Advanced.DOH_DOMAINS"
                    label="DOH 域名"
                    placeholder="example.com,example2.com"
                    hint="使用DOH解析的域名，多个域名使用逗号分隔"
                    persistent-hint
                  />
                </VCol>
              </VRow>
            </div>
          </VWindowItem>

          <VWindowItem value="dev">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.DEBUG"
                    label="DEBUG日志"
                    hint="显示DEBUG级别日志，方便排查问题"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.PLUGIN_AUTO_RELOAD"
                    label="插件热加载"
                    hint="修改插件文件后自动重新加载，开发插件时使用"
                    persistent-hint
                  />
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
        </VWindow>
      </VCardText>
      <VCardActions class="pt-3">
        <VForm @submit.prevent="() => {}">
          <div class="d-flex flex-wrap gap-4 mt-4">
            <VBtn
              color="primary"
              variant="elevated"
              prepend-icon="mdi-content-save"
              @click="saveAdvancedSettings"
              class="px-5"
            >
              保存
            </VBtn>
          </div>
        </VForm>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
