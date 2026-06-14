<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import type { DownloaderConf, Site } from '@/api/types'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { numberValidator, requiredValidator } from '@/@validators'
import api from '@/api'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  siteid: Number,
  oper: String,
})

// 注册事件
const emit = defineEmits(['save', 'remove', 'close'])

// 站点编辑表单数据
const siteForm = ref<Site>({
  id: props.siteid ?? 0,
  url: '',
  rss: '',
  cookie: '',
  ua: '',
  pri: 0,
  is_active: true,
  limit_interval: 0,
  limit_seconds: 0,
  name: '',
  domain: '',
  downloader: '',
})

// 提示框
const $toast = useToast()

// 维护类型
const siteType = ref('cookie')

// 是否限流
const isLimit = ref(false)

// 状态下拉项
const statusItems = [
  { title: t('site.status.enabled'), value: true },
  { title: t('site.status.disabled'), value: false },
]

// 生成1到50的优先级下拉框选项
const priorityItems = ref(
  Array.from({ length: 100 }, (_, i) => i + 1).map(item => ({
    title: item,
    value: item,
  })),
)

// 下载器选项
const downloaderOptions = ref<{ title: string; value: string }[]>([])

async function loadDownloaderSetting() {
  try {
    const downloaders: DownloaderConf[] = await api.get('download/clients')
    downloaderOptions.value = [
      { title: t('common.default'), value: '' },
      ...downloaders.map((item: { name: any }) => ({
        title: item.name,
        value: item.name,
      })),
    ]
  } catch (error) {
    console.error(t('site.errors.loadDownloader'), error)
  }
}

// 查询站点信息
async function fetchSiteInfo() {
  try {
    siteForm.value = await api.get(`site/${props.siteid}`)
    siteForm.value.proxy = siteForm.value.proxy === 1
    siteForm.value.render = siteForm.value.render === 1
  } catch (error) {
    console.error(error)
  }
}

// 调用API 新增站点
async function addSite() {
  if (!siteForm.value?.url) return
  startNProgress()
  try {
    const result: { [key: string]: string } = await api.post('site/', siteForm.value)
    if (result.success) {
      $toast.success(t('site.messages.addSuccess'))
      emit('save')
    } else {
      $toast.error(`${t('site.messages.addFailed')}：${result.message}`)
    }
  } catch (error) {
    console.error(error)
  }
  doneNProgress()
}

// 调用API更新站点信息
async function updateSiteInfo() {
  startNProgress()
  try {
    if (isLimit.value) {
      siteForm.value.limit_interval = siteForm.value.limit_interval || 0
      siteForm.value.limit_count = siteForm.value.limit_count || 0
      siteForm.value.limit_seconds = siteForm.value.limit_seconds || 0
    } else {
      siteForm.value.limit_interval = 0
      siteForm.value.limit_count = 0
      siteForm.value.limit_seconds = 0
    }
    const result: { [key: string]: any } = await api.put('site/', siteForm.value)
    if (result.success) {
      $toast.success(`${siteForm.value?.name} ${t('site.messages.updateSuccess')}`)
      emit('save')
    } else {
      $toast.error(`${siteForm.value?.name} ${t('site.messages.updateFailed')}：${result.message}`)
    }
  } catch (error) {
    $toast.error(`${siteForm.value?.name} ${t('site.messages.updateFailed')}！`)
    console.error(error)
  }
  doneNProgress()
}

onMounted(async () => {
  if (props.oper !== 'add') {
    await fetchSiteInfo()
    if (siteForm.value.limit_interval || siteForm.value.limit_count || siteForm.value.limit_seconds)
      isLimit.value = true
    if (siteForm.value.apikey || siteForm.value.token) siteType.value = 'api'
  }
  await loadDownloaderSetting()
})
</script>

<template>
  <VDialog scrollable :close-on-back="false" eager max-width="45rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem :class="props.oper === 'add' ? 'py-3' : 'py-2'">
        <template #prepend>
          <VIcon :icon="oper == 'add' ? 'mdi-web-plus' : 'mdi-web'" class="me-2" />
        </template>
        <VCardTitle>{{ `${props.oper === 'add' ? t('site.actions.add') : t('site.actions.edit')}` }}</VCardTitle>
        <VCardSubtitle>{{ siteForm.name }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteForm.url"
                :label="t('site.fields.url')"
                :rules="[requiredValidator]"
                :hint="t('site.hints.url')"
                persistent-hint
                prepend-inner-icon="mdi-web"
              />
            </VCol>
            <VCol cols="6" md="3">
              <VAutocomplete
                v-model="siteForm.pri"
                :label="t('site.fields.priority')"
                :items="priorityItems"
                :rules="[requiredValidator]"
                :hint="t('site.hints.priority')"
                persistent-hint
                prepend-inner-icon="mdi-priority-high"
              />
            </VCol>
            <VCol cols="6" md="3">
              <VSelect
                v-model="siteForm.is_active"
                :items="statusItems"
                :label="t('site.fields.status')"
                :hint="t('site.hints.status')"
                persistent-hint
                prepend-inner-icon="mdi-toggle-switch"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteForm.rss"
                :label="t('site.fields.rss')"
                :hint="t('site.hints.rss')"
                persistent-hint
                prepend-inner-icon="mdi-rss"
              />
            </VCol>
            <VCol cols="6" md="3">
              <VTextField
                v-model="siteForm.timeout"
                :label="t('site.fields.timeout')"
                :hint="t('site.hints.timeout')"
                persistent-hint
                prepend-inner-icon="mdi-timer"
              />
            </VCol>
            <VCol cols="6" md="3">
              <VAutocomplete
                v-model="siteForm.downloader"
                :label="t('site.fields.downloader')"
                :items="downloaderOptions"
                :hint="t('site.hints.downloader')"
                persistent-hint
                prepend-inner-icon="mdi-download"
              />
            </VCol>
          </VRow>
          <VTabs v-model="siteType" show-arrows class="v-tabs-pill mt-3">
            <VTab value="cookie" selected-class="v-tab--selected">
              <div>
                <VIcon size="20" start icon="mdi-cookie" />
                Cookie
              </div>
            </VTab>
            <VTab value="api" selected-class="v-tab--selected">
              <div>
                <VIcon size="20" start icon="mdi-api" />
                API
              </div>
            </VTab>
          </VTabs>
          <VWindow v-model="siteType" class="my-3 disable-tab-transition" :touch="false">
            <VWindowItem value="cookie">
              <VRow>
                <VCol cols="12">
                  <VTextarea
                    v-model="siteForm.cookie"
                    :label="t('site.fields.cookie')"
                    :hint="t('site.hints.cookie')"
                    persistent-hint
                    prepend-inner-icon="mdi-cookie"
                  />
                </VCol>
                <VCol cols="12">
                  <VTextField
                    v-model="siteForm.ua"
                    :label="t('site.fields.userAgent')"
                    :hint="t('site.hints.userAgent')"
                    persistent-hint
                    prepend-inner-icon="mdi-web-box"
                  />
                </VCol>
              </VRow>
            </VWindowItem>
            <VWindowItem value="api">
              <VRow>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="siteForm.token"
                    :label="t('site.fields.authorization')"
                    :hint="t('site.hints.authorization')"
                    persistent-hint
                    prepend-inner-icon="mdi-key"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="siteForm.apikey"
                    :label="t('site.fields.apiKey')"
                    :hint="t('site.hints.apiKey')"
                    persistent-hint
                    prepend-inner-icon="mdi-api"
                  />
                </VCol>
              </VRow>
            </VWindowItem>
          </VWindow>
          <VRow>
            <VCol cols="12" md="4">
              <VSwitch v-model="isLimit" :label="t('site.fields.limitAccess')" />
            </VCol>
          </VRow>
          <VRow v-if="isLimit">
            <VCol cols="12" md="4">
              <VTextField
                v-model="siteForm.limit_interval"
                :label="t('site.fields.limitInterval')"
                :rules="[numberValidator]"
                :hint="t('site.hints.limitInterval')"
                persistent-hint
                prepend-inner-icon="mdi-clock-outline"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="siteForm.limit_count"
                :label="t('site.fields.limitCount')"
                :rules="[numberValidator]"
                :hint="t('site.hints.limitCount')"
                persistent-hint
                prepend-inner-icon="mdi-counter"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="siteForm.limit_seconds"
                :label="t('site.fields.limitSeconds')"
                :rules="[numberValidator]"
                :hint="t('site.hints.limitSeconds')"
                persistent-hint
                prepend-inner-icon="mdi-timer-sand"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="siteForm.proxy"
                :label="t('site.fields.useProxy')"
                :hint="t('site.hints.useProxy')"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="siteForm.render"
                :label="t('site.fields.browserSimulation')"
                :hint="t('site.hints.browserSimulation')"
                persistent-hint
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          v-if="props.oper === 'add'"
          color="primary"
          variant="flat"
          @click="addSite"
          prepend-icon="mdi-plus"
          class="px-5"
        >
          {{ t('site.actions.add') }}
        </VBtn>
        <VBtn
          v-else
          color="primary"
          variant="flat"
          @click="updateSiteInfo"
          prepend-icon="mdi-content-save"
          class="px-5"
        >
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
