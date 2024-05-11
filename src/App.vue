<script lang="ts" setup>
import { useTheme } from 'vuetify'
import { checkPrefersColorSchemeIsDark } from '@/@core/utils'

const { global: globalTheme } = useTheme()

// 生效主题
async function setTheme() {
  let themeValue = localStorage.getItem('theme') || 'light'
  const autoTheme = checkPrefersColorSchemeIsDark() ? 'dark' : 'light'
  globalTheme.name.value = themeValue === 'auto' ? autoTheme : themeValue
}

// 页面加载时，加载当前用户数据
onBeforeMount(async () => {
  setTheme()
})
</script>

<template>
  <VApp>
    <RouterView />
  </VApp>
</template>
