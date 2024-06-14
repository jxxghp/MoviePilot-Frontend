<script lang="ts" setup>
import * as Mousetrap from 'mousetrap'
import SearchBarView from '@/views/system/SearchBarView.vue'
import { useDisplay } from 'vuetify'

const display = useDisplay()

const searchDialog = ref(false)

// 注册快捷键
Mousetrap.bind(['command+k', 'ctrl+k'], openSearchDialog)

// 打开搜索弹窗
function openSearchDialog() {
  searchDialog.value = true
  return false
}
</script>

<template>
  <!-- 👉 Search Icon -->
  <div class="d-flex align-center cursor-pointer ms-lg-n2" style="user-select: none">
    <IconBtn @click="openSearchDialog">
      <VIcon icon="ri-search-line" />
    </IconBtn>
    <span v-if="display.lgAndUp.value" class="flex align-center text-disabled ms-2" @click="openSearchDialog">
      <span class="me-3">搜索</span>
      <span class="meta-key">⌘K</span>
    </span>
  </div>
  <!-- 搜索弹窗 -->
  <SearchBarView v-model="searchDialog" v-if="searchDialog" @close="searchDialog = false" />
</template>
<style type="scss" scoped>
.meta-key {
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  block-size: 1.75rem;
  padding-block: 0.1rem;
  padding-inline: 0.25rem;
}
</style>
