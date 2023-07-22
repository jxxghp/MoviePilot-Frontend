<script setup lang="ts">
import { ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import type { ThemeSwitcherTheme } from '@layouts/types'

const props = defineProps<{
  themes: ThemeSwitcherTheme[]
}>()

const { name: themeName, global: globalTheme } = useTheme()

const savedTheme = ref(localStorage.getItem('theme') ?? themeName)

const {
  state: currentThemeName,
  next: getNextThemeName,
  index: currentThemeIndex,
} = useCycleList(
  props.themes.map(t => t.name),
  { initialValue: savedTheme.value },
)

function changeTheme() {
  const nextTheme = getNextThemeName()

  globalTheme.name.value = nextTheme
  savedTheme.value = nextTheme
  localStorage.setItem('theme', nextTheme)
}

// Update icon if theme is changed from other sources
watch(
  () => globalTheme.name.value,
  (val) => {
    currentThemeName.value = val
  },
)

// Apply saved theme on page load
onMounted(() => {
  globalTheme.name.value = savedTheme.value
})
</script>

<template>
  <IconBtn @click="changeTheme">
    <VIcon :icon="props.themes[currentThemeIndex].icon" />
  </IconBtn>
</template>
