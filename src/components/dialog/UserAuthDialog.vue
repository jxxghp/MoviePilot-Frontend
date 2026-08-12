<script lang="ts" setup>
import { isNullOrEmptyObject } from '@/@core/utils'
import api from '@/api'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'

// 多语言支持
const { t } = useI18n()

// 定义事件
const emit = defineEmits(['done', 'close'])

// 提示框
const $toast = useToast()

// 是否加载中
const loading = ref(false)

// 用户认证表单
const authForm = ref<any>({
  site: null,
  params: {},
})

// 所有认证站点
const authSites = ref<{
  [key: string]: {
    name: string
    icon: string
    params: { [key: string]: any }
  }
}>({})

// 生成站点拉选项
const dropdownItems = computed(() => {
  return Object.keys(authSites.value).map(key => {
    return {
      key,
      name: authSites.value[key].name,
      prependAvatar: authSites.value[key].icon,
    }
  })
})

// 读取authSites.params，生成表单配置列表
const formFields = computed(() => {
  const site = authSites.value[authForm.value.site]
  return Object.keys(site?.params || {})
    .filter(item => {
      return site.params[item].name && site.params[item].type
    })
    .map(key => {
      return {
        key,
        site: authForm.value.site,
        name: site.params[key].name,
        type: site.params[key].type,
        placeholder: site.params[key].placeholder,
        tooltip: site.params[key].tooltip,
      }
    })
})

// 查询之前使用的认证参数
async function loadLastAuthParams() {
  try {
    const result = await api.get<{ value?: typeof authForm.value }>(`system/setting/UserSiteAuthParams`)
    const ret = result.value
    if (ret && !isNullOrEmptyObject(ret.params)) {
      authForm.value = ret
    }
  } catch (e) {
    console.error(e)
  }
}

// 加载认证站点配置
async function loadAuthSites() {
  try {
    authSites.value = (await api.get(`site/auth`)) || {}
  } catch (e) {
    console.error(e)
  }
}

// 完成
async function handleDone() {
  await checkUser()
}

// 认证处理
async function checkUser() {
  if (!authForm.value.site) {
    $toast.error(t('dialog.userAuth.selectSiteRequired'))
    return
  }
  if (!authSites.value[authForm.value.site]) {
    $toast.error(t('dialog.userAuth.siteConfigNotExist'))
    return
  }
  if (formFields.value.length > 0) {
    for (const field of formFields.value) {
      if (!authForm.value.params[field.site.toUpperCase() + '_' + field.key.toUpperCase()]) {
        $toast.error(t('dialog.userAuth.fieldRequired', { name: field.name }))
        return
      }
    }
  }
  loading.value = true
  try {
    await api.post<null>(`site/auth`, authForm.value, { feedback: 'silent' })
    $toast.success(t('dialog.userAuth.authSuccess'))
    // 1秒后刷新页面
    setTimeout(() => {
      emit('done')
    }, 1000)
  } catch (e) {
    console.error(e)
    $toast.error(t('dialog.userAuth.authFailed', { message: e instanceof Error ? e.message : '' }))
  }
  loading.value = false
}

onMounted(async () => {
  await loadAuthSites()
  loadLastAuthParams()
})
</script>

<template>
  <VDialog width="40rem" scrollable>
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-user-check" class="me-2" />
          {{ t('dialog.userAuth.title') }}
        </VCardTitle>
        <VDialogCloseBtn @click="emit('close')" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VSelect
              v-model="authForm.site"
              :items="dropdownItems"
              item-value="key"
              item-title="name"
              :label="t('dialog.userAuth.selectSite')"
              item-props
              prepend-inner-icon="mdi-web"
            >
            </VSelect>
          </VCol>
        </VRow>
        <VRow>
          <VCol v-for="param in formFields" :key="param.key">
            <VTextField
              v-model="authForm.params[param.site.toUpperCase() + '_' + param.key.toUpperCase()]"
              :type="param.type"
              :label="param.name"
              :placeholder="param.placeholder"
              :hint="param.tooltip"
              clearable
              persistent-hint
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardText class="text-center">
        <VBtn @click="handleDone" prepend-icon="mdi-check" class="px-5" size="large" :disabled="loading">
          {{ t('dialog.userAuth.authBtn') }}
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>
