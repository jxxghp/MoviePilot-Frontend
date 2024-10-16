<script lang="ts" setup>
import type { PropType } from 'vue'
import { useToast } from 'vue-toast-notification'
import SiteAddEditDialog from '../dialog/SiteAddEditDialog.vue'
import SiteUserDataDialog from '../dialog/SiteUserDataDialog.vue'
import SiteResourceDialog from '../dialog/SiteResourceDialog.vue'
import SiteCookieUpdateDialog from '../dialog/SiteCookieUpdateDialog.vue'
import api from '@/api'
import type { Site, SiteStatistic } from '@/api/types'
import { isNullOrEmptyObject } from '@/@core/utils'
import { VCardActions, VExpandTransition, VSpacer } from 'vuetify/lib/components/index.mjs'

// 输入参数
const cardProps = defineProps({
  site: Object as PropType<Site>,
  width: String,
  height: String,
})

// 定义触发的自定义事件
const emit = defineEmits(['update', 'remove'])

// 图标
const siteIcon = ref<string>('')

// 提示框
const $toast = useToast()

// 测试按钮文字
const testButtonText = ref('测试')

// 测试按钮可用性
const testButtonDisable = ref(false)

// 更新站点Cookie UA弹窗
const siteCookieDialog = ref(false)

// 站点编辑弹窗
const siteEditDialog = ref(false)

// 资源浏览弹窗
const resourceDialog = ref(false)

// 用户数据弹窗
const siteUserDataDialog = ref(false)

// 站点操作显示
const siteActionShow = ref(false)

// 站点使用统计
const siteStats = ref<SiteStatistic>({})

// 查询站点图标
async function getSiteIcon() {
  try {
    siteIcon.value = (await api.get(`site/icon/${cardProps.site?.id}`)).data.icon
  } catch (error) {
    console.error(error)
  }
}

// 测试站点连通性
async function testSite() {
  try {
    testButtonText.value = '测试中 ...'
    testButtonDisable.value = true

    const result: { [key: string]: any } = await api.get(`site/test/${cardProps.site?.id}`)
    if (result.success) $toast.success(`${cardProps.site?.name} 连通性测试成功，可正常使用！`)
    else $toast.error(`${cardProps.site?.name} 连通性测试失败：${result.message}`)

    testButtonText.value = '测试'
    testButtonDisable.value = false

    getSiteStats()
  } catch (error) {
    console.error(error)
  }
}

// 查询站点使用统计
async function getSiteStats() {
  try {
    siteStats.value = await api.get(`site/statistic/${cardProps.site?.domain}`)
  } catch (error) {
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
}

// 打开站点用户数据弹窗
async function handleSiteUserData() {
  siteUserDataDialog.value = true
}

// 打开站点页面
function openSitePage() {
  window.open(cardProps.site?.url, '_blank')
}

// 根据站点状态显示不同的状态图标
const statColor = computed(() => {
  if (isNullOrEmptyObject(siteStats.value)) {
    return 'secondary'
  }
  if (siteStats.value?.lst_state == 1) {
    return 'error'
  } else if (siteStats.value?.lst_state == 0) {
    if (!siteStats.value?.seconds) return 'secondary'
    if (siteStats.value?.seconds >= 5) return 'warning'
    return 'success'
  }
})

// 保存站点
function saveSite() {
  siteEditDialog.value = false
  emit('update')
}

// 更新站点Cookie UA后的回调
function onSiteCookieUpdated() {
  siteCookieDialog.value = false
  getSiteStats()
}

// 资源浏览弹窗关闭后的回调
function onSiteResourceDone() {
  resourceDialog.value = false
  getSiteStats()
}

// 装载时查询站点图标
onMounted(() => {
  getSiteIcon()
  getSiteStats()
})
</script>

<template>
  <div>
    <VCard
      :height="cardProps.height"
      :width="cardProps.width"
      :variant="cardProps.site?.is_active ? 'elevated' : 'outlined'"
      class="overflow-hidden"
      @click="siteEditDialog = true"
    >
      <template #image>
        <VAvatar class="absolute right-2 bottom-2 rounded" variant="flat" rounded="0">
          <VImg :src="siteIcon" />
        </VAvatar>
      </template>
      <VCardItem style="padding-block-end: 0">
        <VCardTitle class="font-bold">
          <span @click.stop="openSitePage">{{ cardProps.site?.name }}</span>
        </VCardTitle>
        <VCardSubtitle>
          <span @click.stop="openSitePage">{{ cardProps.site?.url }}</span>
        </VCardSubtitle>
      </VCardItem>
      <VCardText class="py-2" style="block-size: 36px">
        <VTooltip v-if="cardProps.site?.limit_interval" text="流控">
          <template #activator="{ props }">
            <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-speedometer" />
          </template>
        </VTooltip>
        <VTooltip v-if="cardProps.site?.proxy === 1" text="代理">
          <template #activator="{ props }">
            <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-network-outline" />
          </template>
        </VTooltip>
        <VTooltip v-if="cardProps.site?.render === 1" text="浏览器仿真">
          <template #activator="{ props }">
            <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-apple-safari" />
          </template>
        </VTooltip>
        <VTooltip v-if="cardProps.site?.filter" text="过滤">
          <template #activator="{ props }">
            <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-filter-cog-outline" />
          </template>
        </VTooltip>
      </VCardText>
      <VCardActions>
        <VBtn
          :icon="siteActionShow ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          @click.stop="siteActionShow = !siteActionShow"
        />
        <VSpacer />
      </VCardActions>
      <VDivider class="mb-1" v-if="siteActionShow" />
      <VExpandTransition>
        <div v-show="siteActionShow" class="py-1 pe-12">
          <VBtn v-if="!cardProps.site?.public" @click.stop="handleSiteUpdate" variant="text">
            <template #prepend>
              <VIcon icon="mdi-refresh" />
            </template>
            更新
          </VBtn>
          <VBtn :disabled="testButtonDisable" @click.stop="testSite" variant="text">
            <template #prepend>
              <VIcon icon="mdi-link" />
            </template>
            {{ testButtonText }}
          </VBtn>
          <VBtn @click.stop="handleResourceBrowse" variant="text">
            <template #prepend>
              <VIcon icon="mdi-web" />
            </template>
            浏览
          </VBtn>
          <VBtn @click.stop="handleSiteUserData" variant="text">
            <template #prepend>
              <VIcon icon="mdi-chart-bell-curve" />
            </template>
            数据
          </VBtn>
        </div>
      </VExpandTransition>
      <StatIcon v-if="cardProps.site?.is_active" :color="statColor" />
      <span class="absolute top-1 right-8">
        <VIcon class="cursor-move">mdi-drag</VIcon>
      </span>
    </VCard>
    <!-- 更新站点Cookie & UA弹窗 -->
    <SiteCookieUpdateDialog
      v-if="siteCookieDialog"
      v-model="siteCookieDialog"
      :site="cardProps.site"
      @close="siteCookieDialog = false"
      @done="onSiteCookieUpdated"
    />
    <!-- 站点编辑弹窗 -->
    <SiteAddEditDialog
      v-if="siteEditDialog"
      v-model="siteEditDialog"
      :siteid="cardProps.site?.id"
      @save="saveSite"
      @remove="emit('remove')"
      @close="siteEditDialog = false"
    />
    <!-- 站点数据弹窗 -->
    <SiteUserDataDialog
      v-if="siteUserDataDialog"
      v-model="siteUserDataDialog"
      :site="cardProps.site"
      @close="siteUserDataDialog = false"
    />
    <!-- 站点资源弹窗 -->
    <SiteResourceDialog
      v-if="resourceDialog"
      v-model="resourceDialog"
      :site="cardProps.site"
      @close="onSiteResourceDone"
    />
  </div>
</template>
