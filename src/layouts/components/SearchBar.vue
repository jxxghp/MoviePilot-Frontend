<script lang="ts" setup>
import SearchBarView from '@/views/system/SearchBarView.vue'

const searchDialog = ref(false)

function openSearchDialog() {
  searchDialog.value = true
}
</script>

<template>
  <!-- 👉 Search Icon -->
  <div class="d-flex align-center cursor-pointer ms-lg-n2" style="user-select: none">
    <IconBtn @click="openSearchDialog">
      <VIcon icon="ri-search-line" />
    </IconBtn>
    <span class="d-none d-md-flex align-center text-disabled ms-2" @click="openSearchDialog">
      <span class="me-3">搜索</span>
      <span class="meta-key">⌘K</span>
    </span>
  </div>
  <!-- 搜索弹窗 -->
  <SearchBarView v-model="searchDialog" @close="searchDialog = false" />
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
