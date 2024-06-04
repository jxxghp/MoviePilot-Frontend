<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import draggable from 'vuedraggable'
import { VRow } from 'vuetify/lib/components/index.mjs'
import api from '@/api'
import { MediaDirectory } from '@/api/types'
import DirectoryCard from '@/components/cards/DirectoryCard.vue'

// 媒体库设置项
const transferSettings = ref({
  TRANSFER_TYPE: 'copy',
  OVERWRITE_MODE: 'size',
  TRANSFER_SAME_DISK: true,
})

// 转移方式字典
const transferTypeItems = [
  { title: '硬链接', value: 'link' },
  { title: '复制', value: 'copy' },
  { title: '移动', value: 'move' },
  { title: '软链接', value: 'softlink' },
  { title: 'rclone复制', value: 'rclone_copy' },
  { title: 'rclone移动', value: 'rclone_move' },
]

// 覆盖模式字典
const overwriteModeItems = [
  { title: '从不覆盖', value: 'never' },
  { title: '按大小覆盖', value: 'size' },
  { title: '总是覆盖', value: 'always' },
  { title: '仅保留最新版本', value: 'latest' },
]

// 所有下载目录
const downloadDirectories = ref<MediaDirectory[]>([])

// 所有媒体库目录
const libraryDirectories = ref<MediaDirectory[]>([])

// 二级分类策略
const mediaCategories = ref<{ [key: string]: any }>({})

// 提示框
const $toast = useToast()

// 加载媒体库设置
async function loadTransferSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      const { TRANSFER_TYPE, OVERWRITE_MODE, TRANSFER_SAME_DISK } = result.data
      transferSettings.value = {
        TRANSFER_TYPE,
        OVERWRITE_MODE,
        TRANSFER_SAME_DISK,
      }
    }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存媒体设置
async function saveTransferSetting() {
  try {
    const result: { [key: string]: any } = await api.post('system/env', transferSettings.value)

    if (result.success) $toast.success('保存媒体库设置成功')
    else $toast.error('保存媒体库设置失败！')
  } catch (error) {
    console.log(error)
  }
}

// 移动结束
function orderDownloadCards() {
  // 更新所有目录的优先级
  downloadDirectories.value.forEach((item, index) => {
    item.priority = index
  })
}

// 移动结束
function orderLibraryCards() {
  // 更新所有目录的优先级
  libraryDirectories.value.forEach((item, index) => {
    item.priority = index
  })
}

// 关闭目录卡片
function libraryCardClose(name: string) {
  libraryDirectories.value = libraryDirectories.value.filter(item => item.name !== name)
}

// 关闭下载卡片
function downloadCardClose(name: string) {
  downloadDirectories.value = downloadDirectories.value.filter(item => item.name !== name)
}

// 查询下载目录
async function loadDownloadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/DownloadDirectories')
    if (result.success && result.data?.value) {
      downloadDirectories.value = result.data.value
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存下载目录
async function saveDownloadDirectories() {
  orderDownloadCards()
  try {
    const value = downloadDirectories.value.map(item => {
      return {
        name: item.name,
        path: item.path,
        media_type: item.media_type,
        category: item.category,
        auto_category: item.auto_category,
        priority: item.priority,
      }
    })
    const result: { [key: string]: any } = await api.post('system/setting/DownloadDirectories', value)
    if (result.success) $toast.success('下载目录设置保存成功！')
  } catch (e) {
    console.error('保存下载目录设置失败')
  }
}

// 添加下载目录
function addDownloadDirectory() {
  downloadDirectories.value.push({
    name: `下载目录${downloadDirectories.value.length + 1}`,
    path: '',
    media_type: '全部',
    category: '',
  })
}

// 查询媒体库目录
async function loadLibraryDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/LibraryDirectories')
    if (result.success && result.data?.value) {
      libraryDirectories.value = result.data.value
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存媒体库目录
async function saveLibraryDirectories() {
  orderLibraryCards()
  try {
    const value = libraryDirectories.value.map(item => {
      return {
        name: item.name,
        path: item.path,
        media_type: item.media_type,
        category: item.category,
        auto_category: item.auto_category,
        scrape: item.scrape,
        priority: item.priority,
      }
    })
    const result: { [key: string]: any } = await api.post('system/setting/LibraryDirectories', value)
    if (result.success) $toast.success('媒体库目录设置保存成功！')
  } catch (e) {
    console.error('保存媒体库目录设置失败')
  }
}

// 添加媒体库目录
function addLibraryDirectory() {
  libraryDirectories.value.push({
    name: `媒体库目录${libraryDirectories.value.length + 1}`,
    path: '',
    media_type: '全部',
    category: '',
    scrape: true,
  })
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
  loadTransferSettings()
  loadMediaCategories()
  loadDownloadDirectories()
  loadLibraryDirectories()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>下载目录</VCardTitle>
          <VCardSubtitle>设置下载目录路径和分类，按顺序依次匹配使用。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="downloadDirectories"
            handle=".cursor-move"
            item-key="pri"
            tag="div"
            @end="orderDownloadCards"
            :component-data="{ 'class': 'grid gap-3 grid-directory-card' }"
          >
            <template #item="{ element }">
              <DirectoryCard
                type="download"
                :directory="element"
                :categories="mediaCategories"
                @update:modelValue="(value: string) => (element.path = value)"
                @close="downloadCardClose(element.name)"
              />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VBtn type="submit" class="me-2" @click="saveDownloadDirectories"> 保存 </VBtn>
          <VBtn color="success" variant="tonal" @click="addDownloadDirectory">
            <VIcon icon="mdi-plus" />
          </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>媒体库目录</VCardTitle>
          <VCardSubtitle>设置媒体文件整理后存储目录和分类，按顺序依次匹配使用。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="libraryDirectories"
            handle=".cursor-move"
            item-key="pri"
            tag="div"
            @end="orderLibraryCards"
            :component-data="{ 'class': 'grid gap-3 grid-directory-card' }"
          >
            <template #item="{ element }">
              <DirectoryCard
                type="library"
                :directory="element"
                :categories="mediaCategories"
                @update:modelValue="(value: string) => (element.path = value)"
                @close="libraryCardClose(element.name)"
              />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VBtn type="submit" class="me-2" @click="saveLibraryDirectories"> 保存 </VBtn>
          <VBtn color="success" variant="tonal" @click="addLibraryDirectory">
            <VIcon icon="mdi-plus" />
          </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>整理模式</VCardTitle>
          <VCardSubtitle>设置文件整理方式和偏好。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="transferSettings.TRANSFER_TYPE"
                  :items="transferTypeItems"
                  label="整理方式"
                  hint="文件从下载目录整理到媒体库目录的操作方式"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="transferSettings.OVERWRITE_MODE"
                  :items="overwriteModeItems"
                  label="覆盖模式"
                  hint="媒体库中同名文件已存在时的覆盖方式"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="transferSettings.TRANSFER_SAME_DISK"
                  label="同盘/同根目录优先"
                  hint="优先整理到与下载目录同一磁盘/同一根路径的媒体库目录中"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn mtype="submit" @click="saveTransferSetting"> 保存 </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
