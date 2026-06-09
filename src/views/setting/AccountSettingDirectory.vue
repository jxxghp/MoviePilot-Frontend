<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { TransferDirectoryConf, StorageConf } from '@/api/types'
import DirectoryCard from '@/components/cards/DirectoryCard.vue'
import StorageCard from '@/components/cards/StorageCard.vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'
import { storageAttributes } from '@/api/constants'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'

const { t } = useI18n()
const { global: globalTheme } = useTheme()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 拖拽排序和分类编辑弹窗按需加载，避免设置框架预加载目录页时带上这些交互依赖。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const CategoryEditDialog = defineAsyncComponent(() => import('@/components/dialog/CategoryEditDialog.vue'))

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

// 存储选项（排除已添加的）
const storageOptions = computed(() => {
  const existingTypes = storages.value.map(storage => storage.type)
  return storageAttributes
    .filter(item => !existingTypes.includes(item.type))
    .map(item => ({
      title: t(`storage.${item.type}`),
      value: item.type,
    }))
})

// 系统设置
const SystemSettings = ref<any>({
  Basic: {
    SCRAP_SOURCE: 'themoviedb',
    MOVIE_RENAME_FORMAT: null,
    TV_RENAME_FORMAT: null,
  },
})

// 编辑器主题
// Ace 跟随 Vuetify 当前生效主题，auto 模式下也按实际明暗色渲染。
const editorTheme = computed(() => (globalTheme.current.value.dark ? 'github_dark' : 'github_light_default'))

const renameEditorOptions = {
  fontSize: 14,
  tabSize: 2,
  showLineNumbers: true,
  showGutter: true,
}

// 打开共享分类编辑弹窗，保存后刷新本页分类配置。
function openCategoryDialog() {
  openSharedDialog(
    CategoryEditDialog,
    {},
    {
      save: loadMediaCategories,
    },
    { closeOn: ['close', 'save', 'update:modelValue'] },
  )
}

const movieRenameFormat = computed({
  get: () => SystemSettings.value.Basic.MOVIE_RENAME_FORMAT ?? '',
  set: (value: string) => {
    SystemSettings.value.Basic.MOVIE_RENAME_FORMAT = value || null
  },
})

const tvRenameFormat = computed({
  get: () => SystemSettings.value.Basic.TV_RENAME_FORMAT ?? '',
  set: (value: string) => {
    SystemSettings.value.Basic.TV_RENAME_FORMAT = value || null
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
    const result: { [key: string]: any } = await api.get('system/setting/public/Storages')

    storages.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存存储
async function saveStorages() {
  try {
    const result: { [key: string]: any } = await api.post('system/setting/Storages', storages.value)
    if (result.success) $toast.success(t('setting.directory.storageSaveSuccess'))
    else $toast.error(t('setting.directory.storageSaveFailed'))
  } catch (error) {
    console.log(error)
  }
}

// 查询目录
async function loadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/Directories')
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
      $toast.error(t('setting.directory.duplicateDirectoryName'))
      return
    }
    const result: { [key: string]: any } = await api.post('system/setting/Directories', directories.value)
    if (result.success) {
      $toast.success(t('setting.directory.directorySaveSuccess'))
    } else $toast.error(t('setting.directory.directorySaveFailed'))
  } catch (error) {
    console.log(error)
  }
}

// 添加媒体库目录
function addDirectory() {
  let name = `${t('setting.directory.defaultDirName')}${directories.value.length + 1}`
  while (directories.value.some(item => item.name === name)) {
    name = `${t('setting.directory.defaultDirName')}${
      parseInt(name.split(t('setting.directory.defaultDirName'))[1]) + 1
    }`
  }
  directories.value.push({
    name: name,
    storage: 'local',
    download_path: '',
    priority: -1,
    monitor_type: '',
    media_type: '',
    media_category: '',
    transfer_type: '',
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

// 添加存储
function addStorage(storageType = 'custom') {
  let name: string
  let type: string

  if (storageType === 'custom') {
    // 自定义存储需要数字序号
    name = `${t(`storage.${storageType}`)} ${storages.value.length + 1}`
    while (storages.value.some(item => item.name === name)) {
      const num = parseInt(name.match(/\d+$/)?.[0] || '1') + 1
      name = `${t(`storage.${storageType}`)} ${num}`
    }
    type = `custom${storages.value.length + 1}`
  } else {
    // 预定义存储类型直接使用类型名称
    name = t(`storage.${storageType}`)
    type = storageType
  }

  storages.value.push({
    name: name,
    type: type,
    config: {},
  })

  // 保存存储
  saveStorages()
}

// 移除存储
function removeStorage(storage: StorageConf) {
  const index = storages.value.indexOf(storage)
  if (index > -1) {
    storages.value.splice(index, 1)
  }
}

// 保存设置
async function saveSystemSettings(value: any) {
  try {
    const result: { [key: string]: any } = await api.post('system/env', value)
    if (result.success) {
      $toast.success(t('setting.directory.organizeSaveSuccess'))
    } else $toast.error(t('setting.directory.organizeSaveFailed'))
  } catch (error) {
    console.log(error)
  }
}

async function loadPageData() {
  await Promise.all([loadDirectories(), loadStorages(), loadMediaCategories(), loadSystemSettings()])
}

// 加载数据
onMounted(() => {
  loadPageData()
})

useSilentSettingRefresh(loadPageData, {
  active: computed(() => props.active),
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.directory.storage') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.directory.storageDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <Draggable
            v-model="storages"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
          >
            <template #item="{ element }">
              <StorageCard :storage="element" @close="removeStorage(element)" @done="loadStorages" />
            </template>
          </Draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" class="me-2" @click="saveStorages" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
              <VBtn color="success" variant="tonal">
                <VIcon icon="mdi-plus" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <VListItem v-for="item in storageOptions" :key="item.value" @click="addStorage(item.value)">
                      <VListItemTitle>{{ item.title }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addStorage('custom')">
                      <VListItemTitle>{{ t('storage.custom') }}</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
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
          <VCardTitle>{{ t('setting.directory.directory') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.directory.directoryDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <Draggable
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
                :storages="storages"
                @update:modelValue="
                  (value: any) => {
                    element.download_path = value?.download
                    element.library_path = value?.library
                  }
                "
                @close="removeDirectory(element)"
              />
            </template>
          </Draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveDirectories" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
              <VBtn color="success" variant="tonal" @click="addDirectory" class="me-2">
                <VIcon icon="mdi-plus" />
              </VBtn>
              <VSpacer />
              <VBtn color="info" variant="tonal" prepend-icon="mdi-shape-plus" @click="openCategoryDialog">
                {{ t('setting.category.title') }}
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
          <VCardTitle>{{ t('setting.directory.organizeAndScrap') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.directory.organizeAndScrapDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="SystemSettings.Basic.SCRAP_SOURCE"
                :items="sourceItems"
                :label="t('setting.directory.scrapSource')"
                :hint="t('setting.directory.scrapSourceHint')"
                persistent-hint
                prepend-inner-icon="mdi-database"
              />
            </VCol>
            <VCol cols="12">
              <div class="rename-format-editor">
                <div class="rename-format-editor__label">
                  <VIcon icon="mdi-movie-open" size="20" class="me-2" />
                  <span>{{ t('setting.directory.movieRenameFormat') }}</span>
                </div>
                <VAceEditor
                  v-model:value="movieRenameFormat"
                  lang="jinja2"
                  :theme="editorTheme"
                  :options="renameEditorOptions"
                  :print-margin="false"
                  :min-lines="4"
                  :max-lines="12"
                  wrap
                  class="rename-format-editor__ace rounded"
                />
                <div class="rename-format-editor__hint">
                  {{ t('setting.directory.movieRenameFormatHint') }}
                </div>
              </div>
            </VCol>
            <VCol cols="12">
              <div class="rename-format-editor">
                <div class="rename-format-editor__label">
                  <VIcon icon="mdi-television" size="20" class="me-2" />
                  <span>{{ t('setting.directory.tvRenameFormat') }}</span>
                </div>
                <VAceEditor
                  v-model:value="tvRenameFormat"
                  lang="jinja2"
                  :theme="editorTheme"
                  :options="renameEditorOptions"
                  :print-margin="false"
                  :min-lines="4"
                  :max-lines="12"
                  wrap
                  class="rename-format-editor__ace rounded"
                />
                <div class="rename-format-editor__hint">
                  {{ t('setting.directory.tvRenameFormatHint') }}
                </div>
              </div>
            </VCol>
          </VRow>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveSystemSettings(SystemSettings.Basic)" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>

<style scoped>
.rename-format-editor__label {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.375rem;
  margin-block-end: 0.5rem;
}

.rename-format-editor__ace {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  min-block-size: 8rem;
}

.rename-format-editor__hint {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.75rem;
  line-height: 1.25rem;
  margin-block-start: 0.375rem;
}
</style>
