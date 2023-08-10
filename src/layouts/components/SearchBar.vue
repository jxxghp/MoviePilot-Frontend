<script lang="ts" setup>
// 路由
const router = useRouter()

// 搜索词
const searchWord = ref<string>('')

// 搜索弹窗
const searchDialog = ref(false)

// Search
function search() {
  if (!searchWord.value)
    return

  searchDialog.value = false
  router.push({
    path: '/browse/media/search',
    query: {
      title: searchWord.value,
    },
    force: true,
  })
}
</script>

<template>
  <!-- 👉 Search Button -->
  <div
    class="d-flex align-center cursor-pointer"
    style="user-select: none;"
  >
    <VDialog
      v-model="searchDialog"
      max-width="600"
      transition="dialog-top-transition"
    >
      <!-- Dialog Activator -->
      <template #activator="{ props }">
        <IconBtn
          class="d-lg-none"
          v-bind="props"
        >
          <VIcon icon="mdi-magnify" />
        </IconBtn>
      </template>
      <!-- Dialog Content -->
      <VCard title="搜索">
        <VCardText>
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="searchWord"
                label="电影、电视剧名称"
              />
            </VCol>
          </VRow>
        </VCardText>

        <VCardActions>
          <VSpacer />
          <VBtn
            @click="search"
            @keydown.enter="search"
          >
            搜索
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>

  <!-- 👉 Search Textfield -->
  <span class="w-1/5">
    <VTextField
      key="search_navbar"
      v-model="searchWord"
      class="d-none d-lg-block text-disabled"
      density="compact"
      variant="solo"
      label="搜索电影、电视剧"
      append-inner-icon="mdi-magnify"
      single-line
      hide-details
      flat
      rounded
      @click:append-inner="search"
      @keydown.enter="search"
    />
  </span>
</template>
