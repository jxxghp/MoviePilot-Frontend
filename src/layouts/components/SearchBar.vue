<script lang="ts" setup>
// 路由
const router = useRouter()

// 搜索词
const searchWord = ref(null)

// 搜索弹窗
const searchDialog = ref(false)

// ref
const searchWordInput = ref<HTMLElement | null>(null)

// 当前的搜索类型 media/person
const searchType = ref('media')

// 搜索提示词列表
const searchHintList = ref<string[]>([])

// Search
function search() {
  if (!searchWord.value) return
  if (!searchHintList.value.includes(searchWord.value)) searchHintList.value.push(searchWord.value)
  searchDialog.value = false
  router.push({
    path: '/browse/media/search',
    query: {
      title: searchWord.value,
      type: searchType.value,
    },
  })
}

// 切换搜索类型
function switchSearchType() {
  searchType.value = searchType.value === 'media' ? 'person' : 'media'
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
  <div class="d-flex align-center cursor-pointer" style="user-select: none">
    <VDialog v-model="searchDialog" max-width="50rem" transition="dialog-top-transition">
      <!-- Dialog Content -->
      <VCard title="搜索">
        <VCardText>
          <VRow>
            <VCol cols="12">
              <VCombobox
                ref="searchWordInput"
                v-model="searchWord"
                :items="searchHintList"
                :prepend-inner-icon="searchType == 'person' ? 'mdi-account' : 'mdi-movie'"
                :label="searchType == 'person' ? '搜索演员' : '搜索电影、电视剧'"
                @keydown.enter="search"
                @click:prepend-inner="switchSearchType"
                clearable
              />
            </VCol>
          </VRow>
        </VCardText>

        <VCardActions>
          <VSpacer />
          <VBtn variant="tonal" @click="search"> 搜索 </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
  <!-- 👉 Search Icon -->
  <IconBtn class="d-md-none" @click="openSearchDialog">
    <VIcon icon="mdi-magnify" />
  </IconBtn>
  <!-- 👉 Search Textfield -->
  <span class="w-full me-3">
    <VCombobox
      key="search_navbar"
      v-model="searchWord"
      :items="searchHintList"
      class="d-none d-md-block text-disabled search-box"
      density="compact"
      variant="solo"
      :prepend-inner-icon="searchType == 'person' ? 'mdi-account' : 'mdi-movie'"
      :label="searchType == 'person' ? '搜索演员' : '搜索电影、电视剧'"
      append-inner-icon="mdi-magnify"
      single-line
      hide-details
      flat
      rounded
      @click:append-inner="search"
      @click:prepend-inner="switchSearchType"
      @keydown.enter="search"
    />
  </span>
</template>

<style lang="scss">
.search-box div.v-input__control div[role='textbox'] {
  border: 1px solid rgb(var(--v-theme-background));
}
</style>
