<script setup lang="ts">
// 路由
const router = useRouter()

// 定义事件
const emit = defineEmits(['close'])

// 搜索词
const searchWord = ref(null)

// ref
const searchWordInput = ref<HTMLElement | null>(null)

// 搜索提示词列表
const searchHintList = ref<string[]>([])

// Search
function search(searchType: string) {
  // 搜索类型 media/person
  if (!searchWord.value) return
  if (!searchHintList.value.includes(searchWord.value)) searchHintList.value.push(searchWord.value)
  router.push({
    path: '/browse/media/search',
    query: {
      title: searchWord.value,
      type: searchType,
    },
  })
  emit('close')
}

onMounted(() => {
  setTimeout(() => {
    searchWordInput.value?.focus()
  }, 500)
})
</script>
<template>
  <VDialog max-width="40rem">
    <VCard>
      <VCardText class="pe-12">
        <VCombobox
          ref="searchWordInput"
          v-model="searchWord"
          density="compact"
          variant="plain"
          class="text-high-emphasis"
          placeholder="搜索 ..."
          :items="searchHintList"
        >
          <template #prepend>
            <VIcon icon="ri-search-line" style="opacity: 1" />
          </template>
        </VCombobox>
      </VCardText>
      <DialogCloseBtn inner-class="absolute right-3 top-5 text-high-emphasis" @click="emit('close')" />
      <VDivider />
      <div class="ps h-100">
        <VList lines="one" v-if="searchWord">
          <!-- 搜索结果 -->
          <VListSubheader v-if="searchWord"> 媒体 </VListSubheader>
          <VHover>
            <template #default="hover">
              <VListItem
                prepend-icon="mdi-movie-search"
                density="compact"
                link
                v-bind="hover.props"
                @click="search('media')"
              >
                <VListItemTitle>
                  搜索 <span class="font-bold">{{ searchWord }} </span> 相关的电影、电视剧
                </VListItemTitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                </template>
              </VListItem>
            </template>
          </VHover>
          <VHover>
            <template #default="hover">
              <VListItem
                prepend-icon="mdi-people"
                density="compact"
                link
                v-bind="hover.props"
                @click="search('person')"
              >
                <VListItemTitle>
                  搜索 <span class="font-bold">{{ searchWord }}</span> 相关的人物
                </VListItemTitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                </template>
              </VListItem>
            </template>
          </VHover>
          <VListSubheader v-if="searchWord"> 功能 </VListSubheader>
          <VListSubheader v-if="searchWord"> 插件 </VListSubheader>
        </VList>
        <div v-else>
          <!-- 默认 -->
        </div>
      </div>
    </VCard>
  </VDialog>
</template>
