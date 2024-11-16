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

// 数据源
const sourceItems = [
  { 'title': 'TheMovieDb', 'value': 'themoviedb' },
  { 'title': '豆瓣', 'value': 'douban' },
]

// 系统设置
const SystemSettings = ref<any>({
  Basic: {
    SCRAP_SOURCE: 'themoviedb',
    MOVIE_RENAME_FORMAT: null,
    TV_RENAME_FORMAT: null,
  },
})

// 加载系统设置
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      // 将API返回的值赋值给SystemSettings
      for (const sectionKey of Object.keys(SystemSettings.value) as Array<keyof typeof SystemSettings.value>) {
        Object.keys(SystemSettings.value[sectionKey]).forEach((key: string) => {
          if (result.data.hasOwnProperty(key)) (SystemSettings.value[sectionKey] as any)[key] = result.data[key]
        })
      }
    }
  } catch (error) {
    console.log(error)
  }
}

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

// 修改后生效
async function updatedStorage() {
  await loadStorages()
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
    const names = directories.value.map(item => item.name)
    if (new Set(names).size !== names.length) {
      $toast.error('存在重复目录名称！无法保存，请修改！')
      return
    }
    const result: { [key: string]: any } = await api.post('system/setting/Directories', directories.value)
    if (result.success) {
      $toast.success('目录设置保存成功')
    } else $toast.error('目录设置保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 添加媒体库目录
function addDirectory() {
  let name = `目录${directories.value.length + 1}`
  while (directories.value.some(item => item.name === name)) {
    name = `目录${parseInt(name.split('目录')[1]) + 1}`
  }
  directories.value.push({
    name: name,
    storage: 'local',
    download_path: '',
    priority: -1,
    monitor_type: '',
    media_type: '',
    media_category: '',
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

// 保存设置
async function saveSystemSettings(value: any) {
  try {
    const result: { [key: string]: any } = await api.post('system/env', value)
    if (result.success) {
      $toast.success('整理选项设置保存成功')
    } else $toast.error('整理选项设置保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 加载数据
onMounted(() => {
  loadDirectories()
  loadStorages()
  loadMediaCategories()
  loadSystemSettings()
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
              <StorageCard :storage="element" @done="updatedStorage" />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" class="me-2" @click="saveStorages"> 保存 </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
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
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveDirectories"> 保存 </VBtn>
              <VBtn color="success" variant="tonal" @click="addDirectory">
                <VIcon icon="mdi-plus" />
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>整理 & 刮削</VCardTitle>
          <VCardSubtitle>设置重命名格式、刮削选项等。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="SystemSettings.Basic.SCRAP_SOURCE"
                :items="sourceItems"
                label="刮削数据源"
                hint="刮削时的元数据来源"
                persistent-hint
              />
            </VCol>
            <VCol cols="12">
              <VTextarea
                v-model="SystemSettings.Basic.MOVIE_RENAME_FORMAT"
                label="电影重命名格式"
                hint="使用Jinja2语法，格式参考：https://jinja.palletsprojects.com/en/3.0.x/templates"
                persistent-hint
                clearable
                active
              />
            </VCol>
            <VCol cols="12">
              <VTextarea
                v-model="SystemSettings.Basic.TV_RENAME_FORMAT"
                label="电视剧重命名格式"
                hint="使用Jinja2语法，格式参考：https://jinja.palletsprojects.com/en/3.0.x/templates"
                persistent-hint
                clearable
                active
              />
            </VCol>
          </VRow>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveSystemSettings(SystemSettings.Basic)"> 保存</VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
