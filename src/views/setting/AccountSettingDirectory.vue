<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import draggable from 'vuedraggable'
import { VRow } from 'vuetify/lib/components/index.mjs'
import api from '@/api'
import { TransferDirectoryConf, StorageConf } from '@/api/types'
import DirectoryCard from '@/components/cards/DirectoryCard.vue'
import StorageCard from '@/components/cards/StorageCard.vue'

// 所有下载目录
const directories = ref<TransferDirectoryConf[]>([])

// 所有存储
const storages = ref<StorageConf[]>([])

// 二级分类策略
const mediaCategories = ref<{ [key: string]: any }>({})

// 提示框
const $toast = useToast()

// 移动结束
function orderDirectoryCards() {
  // 更新所有目录的优先级
  directories.value.forEach((item, index) => {
    item.priority = index
  })
}

// 查询存储
async function loadStorages() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Storages')

    storages.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存存储
async function saveStorages() {
  try {
    const result: { [key: string]: any } = await api.post('system/setting/Storages', storages.value)
    if (result.success) $toast.success('存储设置保存成功')
    else $toast.error('存储设置保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 查询目录
async function loadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Directories')
    directories.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存目录
async function saveDirectories() {
  orderDirectoryCards()
  try {
    const result: { [key: string]: any } = await api.post('system/setting/Directories', directories.value)
    if (result.success) $toast.success('目录设置保存成功')
    else $toast.error('目录设置保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 添加媒体库目录
function addDirectory() {
  directories.value.push({
    name: `目录${directories.value.length + 1}`,
    storage: 'local',
    download_path: '',
    priority: -1,
    monitor_type: '',
  })
  orderDirectoryCards()
}

// 移除媒体库目录
function removeDirectory(directory: TransferDirectoryConf) {
  const index = directories.value.indexOf(directory)
  if (index > -1) {
    directories.value.splice(index, 1)
  }
}

// 调用API查询自动分类配置
async function loadMediaCategories() {
  try {
    mediaCategories.value = await api.get('media/category')
  } catch (error) {
    console.log(error)
  }
}

// 加载数据
onMounted(() => {
  loadDirectories()
  loadStorages()
  loadMediaCategories()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>存储</VCardTitle>
          <VCardSubtitle>设置本地或网盘存储。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="storages"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
          >
            <template #item="{ element }">
              <StorageCard :storage="element" />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VBtn type="submit" class="me-2" @click="saveStorages"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>目录</VCardTitle>
          <VCardSubtitle>设置媒体文件整理目录结构，按先后顺序依次匹配。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="directories"
            handle=".cursor-move"
            item-key="pri"
            tag="div"
            @end="orderDirectoryCards"
            :component-data="{ 'class': 'grid gap-3 grid-directory-card items-start' }"
          >
            <template #item="{ element }">
              <DirectoryCard
                :directory="element"
                :categories="mediaCategories"
                @update:modelValue="(value: any) => {element.download_path = value?.download; element.library_path = value?.library}"
                @close="removeDirectory(element)"
              />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VBtn type="submit" class="me-2" @click="saveDirectories"> 保存 </VBtn>
          <VBtn color="success" variant="tonal" @click="addDirectory">
            <VIcon icon="mdi-plus" />
          </VBtn>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
