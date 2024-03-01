<script lang="ts" setup>
// 路由
const router = useRouter()

// 搜索词
const searchWord = ref<string>('')

// 搜索弹窗
const searchDialog = ref(false)

// ref
const searchWordInput = ref<HTMLElement | null>(null)

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
  })
}

// 打开搜索弹窗
function openSearchDialog() {
  searchDialog.value = true
  nextTick(() => {
    searchWordInput.value?.focus()
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
      max-width="50rem"
      transition="dialog-top-transition"
    >
      <!-- Dialog Content -->
      <VCard title="搜索">
        <VCardText>
          <VRow>
            <VCol cols="12">
              <VTextField
                ref="searchWordInput"
                v-model="searchWord"
                label="电影、电视剧名称"
                @keydown.enter="search"
              />
            </VCol>
          </VRow>
        </VCardText>

        <VCardActions>
          <VSpacer />
          <VBtn
            variant="tonal"
            @click="search"
          >
            搜索
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
  <!-- 👉 Search Icon -->
  <IconBtn
    class="d-lg-none"
    @click="openSearchDialog"
  >
    <VIcon icon="mdi-magnify" />
  </IconBtn>
  <!-- 👉 Search Textfield -->
  <span class="w-1/5">
    <VTextField
      key="search_navbar"
      v-model="searchWord"
      class="d-none d-lg-block text-disabled search-box"
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

<style lang="scss">
.search-box div.v-input__control div[role="textbox"] {
  border: 1px solid rgb(var(--v-theme-background));
}
</style>
