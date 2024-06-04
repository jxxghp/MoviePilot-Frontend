<script lang="ts" setup>
import type { NavSectionTitle } from '@layouts/types'

defineProps<{
  item: NavSectionTitle
}>()
</script>

<template>
  <li class="nav-section-title">
    <div class="title-wrapper">
      <!-- eslint-disable vue/no-v-text-v-html-on-component -->
      <span
        class="title-text"
        v-text="item.heading"
      />
      <!-- eslint-enable vue/no-v-text-v-html-on-component -->
    </div>
  </li>
</template>

<style lang="scss">
.layout-vertical-nav {
  .nav-section-title {
    padding-left: 1.375rem;
    padding-right: 1rem;
  }
}
</style>
