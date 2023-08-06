<script lang="ts" setup>
import type { PropType } from 'vue'
import { useToast } from 'vue-toast-notification'
import { formatFileSize } from '@core/utils/formatters'
import { numberValidator, requiredValidator } from '@/@validators'
import api from '@/api'
import type { Site, TorrentInfo } from '@/api/types'
import ExistIcon from '@core/components/ExistIcon.vue'

// 输入参数
const cardProps = defineProps({
  site: Object as PropType<Site>,
  width: String,
  height: String,
})

// 密码输入
const isPasswordVisible = ref(false)

// 图标
const siteIcon = ref<string>('')

// 提示框
const $toast = useToast()

// 测试按钮文字
const testButtonText = ref('测试')

// 测试按钮可用性
const testButtonDisable = ref(false)

// 更新按钮文字
const updateButtonText = ref('更新')

// 更新按钮可用性
const updateButtonDisable = ref(false)

// 更新站点Cookie UA弹窗
const siteCookieDialog = ref(false)

// 站点编辑弹窗
const siteInfoDialog = ref(false)

// 资源浏览弹窗
const resourceDialog = ref(false)

// 资源浏览表头
const resourceHeaders = [
  { title: '标题', key: 'title', sortable: false },
  { title: '时间', key: 'pubdate', sortable: false },
  { title: '大小', key: 'size', sortable: false },
  { title: '做种', key: 'seeders', sortable: false },
  { title: '下载', key: 'peers', sortable: false },
  { title: '', key: 'actions', sortable: false },
]

// 数据列表
const resourceDataList = ref<TorrentInfo[]>([])

// 搜索
const resourceSearch = ref('')

// 加载状态
const resourceLoading = ref(false)

// 总条数
const resourceTotalItems = ref(1000)

// 每页条数
const resourceItemsPerPage = ref(100)

// 当前页码
const resourceCurrentPage = ref(1)

// 用户名密码表单
const userPwForm = ref({
  username: '',
  password: '',
})

// 状态下拉项
const statusItems = [
  { title: '启用', value: true },
  { title: '停用', value: false },
]

// 站点编辑表单数据
const siteForm = reactive({
  // ID
  id: cardProps.site?.id,

  // 站点名称
  name: cardProps.site?.name,

  // 站点主域名Key
  domain: cardProps.site?.domain,

  // 站点地址
  url: cardProps.site?.url,

  // 站点优先级
  pri: cardProps.site?.pri,

  // RSS地址
  rss: cardProps.site?.rss,

  // Cookie
  cookie: cardProps.site?.cookie,

  // User-Agent
  ua: cardProps.site?.ua,

  // 是否使用代理
  proxy: !!cardProps.site?.proxy,

  // 过滤规则
  filter: cardProps.site?.filter,

  // 是否演染
  render: !!cardProps.site?.render,

  // 是否公开站点
  public: cardProps.site?.public,

  // 备注
  note: cardProps.site?.note,

  // 流控单位周期
  limit_interval: cardProps.site?.limit_interval,

  // 流控次数
  limit_count: cardProps.site?.limit_count,

  // 流控间隔
  limit_seconds: cardProps.site?.limit_seconds,

  // 是否启用
  is_active: cardProps.site?.is_active,
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

// 打开站点编辑弹窗
async function handleSiteInfo() {
  siteInfoDialog.value = true
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
    updateButtonText.value = '更新中 ...'
    updateButtonDisable.value = true

    const result: { [key: string]: any } = await api.get(
      `site/cookie/${cardProps.site?.id}`,
      {
        params: {
          username: userPwForm.value.username,
          password: userPwForm.value.password,
        },
      },
    )

    if (result.success)
      $toast.success(`${cardProps.site?.name} 更新Cookie & UA 成功！`)
    else
      $toast.error(`${cardProps.site?.name} 更新失败：${result.message}`)

    updateButtonText.value = '更新'
    updateButtonDisable.value = false
  }
  catch (error) {
    console.error(error)
  }
}

// 调用API更新站点信息
async function updateSiteInfo() {
  try {
    // 更新按钮状态
    siteInfoDialog.value = false

    const result: { [key: string]: any } = await api.put('site', siteForm)
    if (result.success)
      $toast.success(`${cardProps.site?.name} 更新成功！`)
    else
      $toast.error(`${cardProps.site?.name} 更新失败：${result.message}`)
  }
  catch (error) {
    $toast.error(`${cardProps.site?.name} 更新失败！`)
    console.error(error)
  }
}

// 调用API，查询站点资源
async function getResourceList() {
  resourceLoading.value = true
  try {
    resourceDataList.value = await api.get('search/title', {
      params: {
        keyword: resourceSearch.value,
        page: resourceCurrentPage.value,
        site: cardProps.site?.id,
      },
    })
    resourceLoading.value = false
  }
  catch (error) {
    console.error(error)
  }
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
    :flat="!siteForm.is_active"
    class="overflow-hidden"
    @click="handleSiteInfo"
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
        {{ cardProps.site?.name }}
      </VCardTitle>
      <VCardSubtitle>{{ cardProps.site?.url }}</VCardSubtitle>
    </VCardItem>

    <ExistIcon v-if="siteForm.is_active" />

    <VCardText class="py-2">
      <VTooltip
        v-if="siteForm.render"
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
        v-if="siteForm.proxy"
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
        v-if="siteForm.limit_interval"
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
        v-if="siteForm.filter"
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

    <VCardActions>
      <VBtn
        v-if="!cardProps.site?.public"
        :disabled="updateButtonDisable"
        @click.stop="handleSiteUpdate"
      >
        <template #prepend>
          <VIcon icon="mdi-refresh" />
        </template>
        {{ updateButtonText }}
      </VBtn>
      <VBtn
        :disabled="testButtonDisable"
        @click.stop="testSite"
      >
        <template #prepend>
          <VIcon icon="mdi-network-outline" />
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
    max-width="600"
  >
    <!-- Dialog Content -->
    <VCard title="更新站点Cookie & UA">
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="userPwForm.username"
                label="用户名"
                :rules="[requiredValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
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
          </VRow>
        </VForm>
      </VCardText>

      <VCardActions>
        <VSpacer />
        <VBtn @click="updateSiteCookie">
          开始更新
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <!-- 站点编辑弹窗 -->
  <VDialog
    v-model="siteInfoDialog"
    max-width="1000"
    persistent
    scrollable
  >
    <!-- Dialog Content -->
    <VCard :title="`编辑站点 - ${cardProps.site?.name}`">
      <VCardText class="pt-2">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="siteForm.url"
                label="站点地址"
                :rules="[requiredValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="3"
            >
              <VSelect
                v-model="siteForm.pri"
                label="优先级"
                :items="[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]"
                :rules="[requiredValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="3"
            >
              <VSelect
                v-model="siteForm.is_active"
                :items="statusItems"
                label="状态"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12">
              <VTextarea
                v-model="siteForm.cookie"
                label="站点Cookie"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="siteForm.ua"
                label="站点User-Agent"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="siteForm.limit_interval"
                label="单位周期（秒）"
                :rules="[numberValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="siteForm.limit_seconds"
                label="访问次数"
                :rules="[numberValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="siteForm.limit_seconds"
                label="访问间隔（秒）"
                :rules="[numberValidator]"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol
              cols="12"
              md="6"
            >
              <VSwitch
                v-model="siteForm.proxy"
                label="代理"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VSwitch
                v-model="siteForm.render"
                label="仿真"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>

      <VCardActions>
        <VBtn @click="siteInfoDialog = false">
          取消
        </VBtn>
        <VSpacer />
        <VBtn @click="updateSiteInfo">
          确定
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <!-- 站点资源弹窗 -->
  <VDialog
    v-model="resourceDialog"
    max-width="1600"
    scrollable
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
          item-value="id"
          return-object
          fixed-header
          items-per-page-text="每页条数"
          page-text="{0}-{1} 共 {2} 条"
        >
          <template #item.title="{ item }">
            <div>{{ item.raw.title }}</div>
            <div><small>{{ item.raw.description }}</small></div>
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
          </template>
          <template #item.pubdate="{ item }">
            <div>{{ item.raw.date_elapsed }}</div>
            <div><small>{{ item.raw.pubdate }}</small></div>
          </template>
          <template #item.size="{ item }">
            <div>{{ formatFileSize(item.raw.size) }}</div>
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
                      variant="plain"
                      @click="downloadTorrentFile(item.raw.enclosure)"
                    >
                      <template #prepend>
                        <VIcon icon="mdi-download" />
                      </template>
                      <VListItemTitle>下载种子</VListItemTitle>
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
</template>
