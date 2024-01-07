<script setup lang="ts">
import type { ThemeSwitcherTheme } from '@layouts/types'

const themes: ThemeSwitcherTheme[] = [
  {
    name: 'light',
    icon: 'mdi-weather-sunny',
  },
  {
    name: 'dark',
    icon: 'mdi-weather-night',
  },
  {
    name: 'purple',
    icon: 'mdi-brightness-4',
  },
  {
    name: 'auto',
    icon: 'mdi-brightness-auto',
  },
]
</script>

<template>
  <ThemeSwitcher :themes="themes" />
</template>
