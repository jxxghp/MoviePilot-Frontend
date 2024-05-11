<script setup lang="ts">
import type { ThemeSwitcherTheme } from '@layouts/types'

const themes: ThemeSwitcherTheme[] = [
  {
    name: 'auto',
    title: '跟随系统',
    icon: 'mdi-laptop',
  },
  {
    name: 'light',
    title: '明亮',
    icon: 'mdi-weather-sunny',
  },
  {
    name: 'dark',
    title: '暗黑',
    icon: 'mdi-weather-night',
  },
  {
    name: 'purple',
    title: '紫韵幽兰',
    icon: 'mdi-brightness-4',
  },
]
</script>

<template>
  <ThemeSwitcher class="ms-2" :themes="themes" />
</template>
