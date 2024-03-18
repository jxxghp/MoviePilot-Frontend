<script lang="ts" setup>
import type { PropType } from 'vue'
import { useToast } from 'vue-toast-notification'
import { useConfirm } from 'vuetify-use-dialog'
import SiteAddEditForm from '../form/SiteAddEditForm.vue'
import { formatFileSize } from '@core/utils/formatters'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { Site, TorrentInfo } from '@/api/types'
import ExistIcon from '@core/components/ExistIcon.vue'
import { doneNProgress, startNProgress } from '@/api/nprogress'

// 输入参数
const cardProps = defineProps({
  site: Object as PropType<Site>,
  width: String,
  height: String,
})

// 定义触发的自定义事件
const emit = defineEmits(['update', 'remove'])

// 密码输入
const isPasswordVisible = ref(false)

// 图标
const siteIcon = ref<string>('')

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 测试按钮文字
const testButtonText = ref('测试')

// 测试按钮可用性
const testButtonDisable = ref(false)

// 更新按钮可用性
const updateButtonDisable = ref(false)

// 更新站点Cookie UA弹窗
const siteCookieDialog = ref(false)

// 站点编辑弹窗
const siteEditDialog = ref(false)

// 资源浏览弹窗
const resourceDialog = ref(false)

// 进度条
const progressDialog = ref(false)

// 进度文本
const progressText = ref('请稍候 ...')

// 资源浏览表头
const resourceHeaders = [
  { title: '标题', key: 'title', sortable: false },
  { title: '时间', key: 'pubdate', sortable: true },
  { title: '大小', key: 'size', sortable: true },
  { title: '做种', key: 'seeders', sortable: true },
  { title: '下载', key: 'peers', sortable: true },
  { title: '', key: 'actions', sortable: false },
]

// 数据列表
const resourceDataList = ref<TorrentInfo[]>([])

// 搜索
const resourceSearch = ref('')

// 加载状态
const resourceLoading = ref(false)

// 总条数
const resourceTotalItems = ref(0)

// 每页条数
const resourceItemsPerPage = ref(25)

// 用户名密码表单
const userPwForm = ref({
  username: '',
  password: '',
  code: '',
})

// 打开种子详情页面
function openTorrentDetail(page_url: string) {
  window.open(page_url, '_blank')
}

// 下载种子文件
async function downloadTorrentFile(enclosure: string) {
  window.open(enclosure, '_blank')
}

// 查询站点图标
async function getSiteIcon() {
  try {
    siteIcon.value = (await api.get(`site/icon/${cardProps.site?.id}`)).data.icon
  }
  catch (error) {
    console.error(error)
  }
}

// 测试站点连通性
async function testSite() {
  try {
    testButtonText.value = '测试中 ...'
    testButtonDisable.value = true

    const result: { [key: string]: any } = await api.get(`site/test/${cardProps.site?.id}`)
    if (result.success)
      $toast.success(`${cardProps.site?.name} 连通性测试成功，可正常使用！`)
    else
      $toast.error(`${cardProps.site?.name} 连通性测试失败：${result.message}`)

    testButtonText.value = '测试'
    testButtonDisable.value = false
  }
  catch (error) {
    console.error(error)
  }
}

// 打开更新站点Cookie UA弹窗
async function handleSiteUpdate() {
  siteCookieDialog.value = true
}

// 打开资源浏览弹窗
async function handleResourceBrowse() {
  resourceDialog.value = true
  getResourceList()
}

// 调用API，更新站点Cookie UA
async function updateSiteCookie() {
  try {
    if (!userPwForm.value.username || !userPwForm.value.password)
      return

    // 更新按钮状态
    siteCookieDialog.value = false
    updateButtonDisable.value = true

    progressDialog.value = true
    progressText.value = `正在更新 ${cardProps.site?.name} Cookie & UA ...`

    const result: { [key: string]: any } = await api.get(
      `site/cookie/${cardProps.site?.id}`,
      {
        params: {
          username: userPwForm.value.username,
          password: userPwForm.value.password,
          code: userPwForm.value.code,
        },
      },
    )

    if (result.success)
      $toast.success(`${cardProps.site?.name} 更新Cookie & UA 成功！`)
    else
      $toast.error(`${cardProps.site?.name} 更新失败：${result.message}`)

    progressDialog.value = false
    updateButtonDisable.value = false
  }
  catch (error) {
    console.error(error)
  }
}

// 促销Chip类
function getVolumeFactorClass(downloadVolume: number, uploadVolume: number) {
  if (downloadVolume === 0)
    return 'text-white bg-lime-500'
  else if (downloadVolume < 1)
    return 'text-white bg-green-500'
  else if (uploadVolume !== 1)
    return 'text-white bg-sky-500'
  else
    return 'text-white bg-gray-500'
}

// 调用API，查询站点资源
async function getResourceList() {
  resourceLoading.value = true
  try {
    resourceDataList.value = await api.get(`site/resource/${cardProps.site?.id}`)
    resourceLoading.value = false
  }
  catch (error) {
    console.error(error)
  }
}

// 打开站点页面
function openSitePage() {
  window.open(cardProps.site?.url, '_blank')
}

// 添加下载
async function addDownload(_torrent: any) {
  const isConfirmed = await createConfirm({
    title: '确认',
    content: `是否确认下载【${_torrent.site_name}】${_torrent?.title} ?`,
    confirmationText: '确认',
    cancellationText: '取消',
    dialogProps: {
      maxWidth: '50rem',
    },
    confirmationButtonProps: {
      variant: 'tonal',
    },
  })

  if (!isConfirmed)
    return

  startNProgress()
  try {
    const result: { [key: string]: any } = await api.post('download/add', _torrent)

    if (result.success) {
      // 添加下载成功
      $toast.success(`${_torrent?.site_name} ${_torrent?.title} 添加下载成功！`)
    }
    else {
      // 添加下载失败
      $toast.error(`${_torrent?.site_name} ${_torrent?.title} 添加下载失败！`)
    }
  }
  catch (error) {
    console.error(error)
  }
  doneNProgress()
}

// 装载时查询站点图标
onMounted(() => {
  getSiteIcon()
})
</script>

<template>
  <VCard
    :height="cardProps.height"
    :width="cardProps.width"
    :flat="!cardProps.site?.is_active"
    class="overflow-hidden"
    @click="siteEditDialog = true"
  >
    <template #image>
      <VAvatar
        class="absolute right-2 bottom-2 rounded"
        variant="flat"
        rounded="0"
      >
        <VImg :src="siteIcon" />
      </VAvatar>
    </template>
    <VCardItem>
      <VCardTitle class="font-bold">
        <span @click.stop="openSitePage">{{ cardProps.site?.name }}</span>
      </VCardTitle>
      <VCardSubtitle>
        {{ cardProps.site?.url }}
      </VCardSubtitle>
    </VCardItem>

    <ExistIcon v-if="cardProps.site?.is_active" />

    <VCardText class="py-2">
      <VTooltip
        v-if="cardProps.site?.render === 1"
        text="浏览器仿真"
      >
        <template #activator="{ props }">
          <VIcon
            color="primary"
            class="me-2"
            v-bind="props"
            icon="mdi-apple-safari"
          />
        </template>
      </VTooltip>

      <VTooltip
        v-if="cardProps.site?.proxy === 1"
        text="代理"
      >
        <template #activator="{ props }">
          <VIcon
            color="primary"
            class="me-2"
            v-bind="props"
            icon="mdi-network-outline"
          />
        </template>
      </VTooltip>

      <VTooltip
        v-if="cardProps.site?.limit_interval"
        text="流控"
      >
        <template #activator="{ props }">
          <VIcon
            color="primary"
            class="me-2"
            v-bind="props"
            icon="mdi-speedometer"
          />
        </template>
      </VTooltip>

      <VTooltip
        v-if="cardProps.site?.filter"
        text="过滤"
      >
        <template #activator="{ props }">
          <VIcon
            color="primary"
            class="me-2"
            v-bind="props"
            icon="mdi-filter-cog-outline"
          />
        </template>
      </VTooltip>
    </VCardText>

    <VDivider
      class="opacity-75"
      style="border-color: rgba(var(--v-theme-on-background), var(--v-selected-opacity));"
    />

    <VCardActions>
      <VBtn
        v-if="!cardProps.site?.public"
        :disabled="updateButtonDisable"
        @click.stop="handleSiteUpdate"
      >
        <template #prepend>
          <VIcon icon="mdi-refresh" />
        </template>
        更新
      </VBtn>
      <VBtn
        :disabled="testButtonDisable"
        @click.stop="testSite"
      >
        <template #prepend>
          <VIcon icon="mdi-link" />
        </template>
        {{ testButtonText }}
      </VBtn>
      <VBtn @click.stop="handleResourceBrowse">
        <template #prepend>
          <VIcon icon="mdi-web" />
        </template>
        浏览
      </VBtn>
    </VCardActions>
  </VCard>
  <!-- 更新站点Cookie & UA弹窗 -->
  <VDialog
    v-model="siteCookieDialog"
    max-width="50rem"
  >
    <!-- Dialog Content -->
    <VCard title="更新站点Cookie & UA">
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="userPwForm.username"
                label="用户名"
                :rules="[requiredValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="userPwForm.password"
                label="密码"
                :type="isPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="
                  isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
                "
                :rules="[requiredValidator]"
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
                @keydown.enter="updateSiteCookie"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="userPwForm.code"
                label="两步验证"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>

      <VCardActions>
        <VSpacer />
        <VBtn
          variant="tonal"
          @click="updateSiteCookie"
        >
          开始更新
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <SiteAddEditForm
    v-model="siteEditDialog"
    :siteid="cardProps.site?.id"
    @save="siteEditDialog = false; emit('update')"
    @remove="emit('remove')"
    @close="siteEditDialog = false"
  />
  <!-- 站点资源弹窗 -->
  <VDialog
    v-model="resourceDialog"
    max-width="80rem"
    scrollable
    z-index="1010"
  >
    <!-- Dialog Content -->
    <VCard :title="`浏览站点 - ${cardProps.site?.name}`">
      <DialogCloseBtn @click="resourceDialog = false" />
      <VCardText class="pt-2">
        <VDataTable
          v-model:items-per-page="resourceItemsPerPage"
          :headers="resourceHeaders"
          :items="resourceDataList"
          :items-length="resourceTotalItems"
          :search="resourceSearch"
          :loading="resourceLoading"
          density="compact"
          item-value="title"
          return-object
          fixed-header
          hover
          items-per-page-text="每页条数"
          page-text="{0}-{1} 共 {2} 条"
        >
          <template #item.title="{ item }">
            <a href="javascript:void(0)" @click.stop="addDownload(item.raw)">
              <div class="text-high-emphasis pt-1">
                {{ item.raw.title }}
              </div>
              <div class="text-sm my-1">
                {{ item.raw.description }}
              </div>
              <VChip
                v-if="item.raw?.hit_and_run"
                variant="elevated"
                size="small"
                class="me-1 mb-1 text-white bg-black"
              >
                H&R
              </VChip>
              <VChip
                v-if="item.raw?.freedate_diff"
                variant="elevated"
                color="secondary"
                size="small"
                class="me-1 mb-1"
              >
                {{ item.raw?.freedate_diff }}
              </VChip>
              <VChip
                v-for="(label, index) in item.raw?.labels"
                :key="index"
                variant="elevated"
                size="small"
                color="primary"
                class="me-1 mb-1"
              >
                {{ label }}
              </VChip>
              <VChip
                v-if="item.raw?.downloadvolumefactor !== 1 || item.raw?.uploadvolumefactor !== 1"
                :class="
                  getVolumeFactorClass(item.raw?.downloadvolumefactor, item.raw?.uploadvolumefactor)
                "
                variant="elevated"
                size="small"
                class="me-1 mb-1"
              >
                {{ item.raw?.volume_factor }}
              </VChip>
            </a>
          </template>
          <template #item.pubdate="{ item }">
            <div>{{ item.raw.date_elapsed }}</div>
            <div class="text-sm">
              {{ item.raw.pubdate }}
            </div>
          </template>
          <template #item.size="{ item }">
            <div class="text-nowrap whitespace-nowrap">
              {{ formatFileSize(item.raw.size) }}
            </div>
          </template>
          <template #item.seeders="{ item }">
            <div>{{ item.raw.seeders }}</div>
          </template>
          <template #item.peers="{ item }">
            <div>{{ item.raw.peers }}</div>
          </template>
          <template #item.actions="{ item }">
            <div class="me-n3">
              <IconBtn>
                <VIcon
                  icon="mdi-dots-vertical"
                />
                <VMenu
                  activator="parent"
                  close-on-content-click
                >
                  <VList>
                    <VListItem
                      variant="plain"
                      @click="openTorrentDetail(item.raw.page_url)"
                    >
                      <template #prepend>
                        <VIcon icon="mdi-information" />
                      </template>
                      <VListItemTitle>查看详情</VListItemTitle>
                    </VListItem>
                    <VListItem
                      v-if="item.raw.enclosure?.startsWith('http')"
                      variant="plain"
                      @click="downloadTorrentFile(item.raw.enclosure)"
                    >
                      <template #prepend>
                        <VIcon icon="mdi-download" />
                      </template>
                      <VListItemTitle>下载种子文件</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </IconBtn>
            </div>
          </template>
          <template #no-data>
            没有数据
          </template>
        </VDataTable>
      </VCardText>
    </VCard>
  </VDialog>
  <VDialog
    v-model="progressDialog"
    :scrim="false"
    width="25rem"
  >
    <VCard
      color="primary"
    >
      <VCardText class="text-center">
        {{ progressText }}
        <VProgressLinear
          indeterminate
          color="white"
          class="mb-0 mt-1"
        />
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style lang="scss">
.v-table th {
  white-space: nowrap;
}
</style>
