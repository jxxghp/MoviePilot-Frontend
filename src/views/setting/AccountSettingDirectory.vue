<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api, { getApiErrorMessage } from '@/api'
import type { StorageConf, TransferDirectoryConf } from '@/api/types'
import type { ClassificationCategory } from '@/api/mediaClassification'
import DirectoryCard from '@/components/cards/DirectoryCard.vue'
import StorageCard from '@/components/cards/StorageCard.vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'
import { storageAttributes } from '@/api/constants'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import { configureAceEditorPadding } from '@/utils/aceEditor'
import { useMediaClassification } from '@/composables/useMediaClassification'

const { t } = useI18n()
const { global: globalTheme } = useTheme()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 拖拽排序按需加载，避免设置框架预加载目录页时带上交互依赖。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const AccountSettingClassification = defineAsyncComponent(() =>
  import('@/views/setting/AccountSettingClassification.vue').then(module => module.default),
)

// 所有下载目录
const directories = ref<TransferDirectoryConf[]>([])

// 所有存储
const storages = ref<StorageConf[]>([])

const { activePolicy, refreshPolicy } = useMediaClassification()
const classificationDialogOpen = ref(false)
const classificationDialogMounted = ref(false)

// 目录卡片只消费活动策略中的稳定分类定义。
const mediaCategories = computed<ClassificationCategory[]>(() =>
  (activePolicy.value?.categories ?? []).map(category => ({
    ...category,
    path: [...category.path],
    labels: [...category.labels],
  })),
)
const classificationLoadError = ref<string | null>(null)
const directorySaveError = ref<string | null>(null)

// 提示框
const $toast = useToast()

// 数据源
const sourceItems = computed(() => [
  { title: t('setting.cache.recognitionSource.themoviedb'), value: 'themoviedb' },
  { title: t('setting.cache.recognitionSource.douban'), value: 'douban' },
  { title: t('setting.cache.recognitionSource.bangumi'), value: 'bangumi' },
  { title: t('setting.cache.recognitionSource.anilist'), value: 'anilist' },
  { title: t('setting.cache.recognitionSource.musicbrainz'), value: 'musicbrainz' },
  { title: t('setting.cache.recognitionSource.theaudiodb'), value: 'theaudiodb' },
  { title: t('setting.cache.recognitionSource.doubanmusic'), value: 'doubanmusic' },
])

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
    MUSIC_RENAME_FORMAT: null,
  },
})

// 挂载型本地盘删除空目录开关
const mountedLocalDiskDeleteEmptyDirs = ref(true)
const mountedLocalDiskDeleteEmptyDirsKey = 'MountedLocalDiskDeleteEmptyDirs'

// 编辑器主题
// Ace 跟随 Vuetify 当前生效主题，auto 模式下也按实际明暗色渲染。
const editorTheme = computed(() => (globalTheme.current.value.dark ? 'github_dark' : 'github_light_default'))

const renameEditorOptions = {
  fontSize: 14,
  tabSize: 2,
  showLineNumbers: true,
  showGutter: true,
}

/** 打开目录页内的全屏自动分类编辑器，并保留已经打开过的草稿状态。 */
function openClassificationSettings(): void {
  classificationDialogMounted.value = true
  classificationDialogOpen.value = true
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

const musicRenameFormat = computed({
  get: () => SystemSettings.value.Basic.MUSIC_RENAME_FORMAT ?? '',
  set: value => {
    SystemSettings.value.Basic.MUSIC_RENAME_FORMAT = value || null
  },
})

// 加载系统设置
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    // 将API返回的值赋值给SystemSettings
    for (const sectionKey of Object.keys(SystemSettings.value) as Array<keyof typeof SystemSettings.value>) {
      Object.keys(SystemSettings.value[sectionKey]).forEach((key: string) => {
        if (Object.prototype.hasOwnProperty.call(result, key)) {
          Reflect.set(SystemSettings.value[sectionKey], key, result[key])
        }
      })
    }
  } catch (error) {
    console.log(error)
  }
}

// 加载挂载盘空目录清理设置
async function loadMountedLocalDiskDeleteEmptyDirs() {
  try {
    const result = await api.get<{ value?: boolean | null }>(`system/setting/${mountedLocalDiskDeleteEmptyDirsKey}`)
    mountedLocalDiskDeleteEmptyDirs.value = result.value ?? true
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
    const result = await api.get<{ value?: StorageConf[] }>('system/setting/public/Storages')
    storages.value = result.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存存储
async function saveStorages() {
  try {
    await api.post('system/setting/Storages', storages.value, { feedback: 'silent' })
    $toast.success(t('setting.directory.storageSaveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.directory.storageSaveFailed'))
  }
}

// 查询目录
async function loadDirectories(options: { rethrow?: boolean } = {}) {
  try {
    const result = await api.get<{ value?: TransferDirectoryConf[] }>('system/setting/public/Directories')
    directories.value = result.value ?? []
  } catch (error) {
    console.log(error)
    if (options.rethrow) throw error
  }
}

/** 判断目录中的稳定分类引用是否必须在保存前修复。 */
function invalidDirectoryCategory(directory: TransferDirectoryConf): boolean {
  const categoryId = directory.media_category_id?.trim()
  if (!categoryId) {
    const legacyPath = directory.media_category?.trim()
    if (!legacyPath) return false
    if (!directory.media_type) return true
    return (
      mediaCategories.value.filter(
        category =>
          category.enabled && category.media_type === directory.media_type && category.path.join('/') === legacyPath,
      ).length !== 1
    )
  }
  const category = mediaCategories.value.find(item => item.id === categoryId)
  return !category || !category.enabled || !directory.media_type || category.media_type !== directory.media_type
}

// 保存目录
async function saveDirectories() {
  orderDirectoryCards()
  directorySaveError.value = null
  try {
    const names = directories.value.map(item => item.name)
    if (new Set(names).size !== names.length) {
      $toast.error(t('setting.directory.duplicateDirectoryName'))
      return
    }
    if (directories.value.some(invalidDirectoryCategory)) {
      const message = t('setting.directory.classification.saveBlocked')
      directorySaveError.value = message
      $toast.error(message)
      return
    }
    await api.post('system/setting/Directories', directories.value, { feedback: 'silent' })
    // 服务端负责把稳定 ID 解析为当前规范路径，成功后必须以回读快照替换本地草稿。
    await loadDirectories({ rethrow: true })
    $toast.success(t('setting.directory.directorySaveSuccess'))
  } catch (error) {
    console.log(error)
    const message = getApiErrorMessage(error) || t('setting.directory.directorySaveFailed')
    directorySaveError.value = message
    $toast.error(message)
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
    media_category_id: null,
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
  classificationLoadError.value = null
  try {
    await refreshPolicy()
  } catch (error) {
    console.log(error)
    classificationLoadError.value = getApiErrorMessage(error) || t('setting.directory.classification.loadFailed')
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
    await Promise.all([
      api.post('system/env', value, { feedback: 'silent' }),
      api.post(`system/setting/${mountedLocalDiskDeleteEmptyDirsKey}`, mountedLocalDiskDeleteEmptyDirs.value, {
        feedback: 'silent',
      }),
    ])
    $toast.success(t('setting.directory.organizeSaveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.directory.organizeSaveFailed'))
  }
}

async function loadPageData() {
  await Promise.all([
    loadDirectories(),
    loadStorages(),
    loadMediaCategories(),
    loadSystemSettings(),
    loadMountedLocalDiskDeleteEmptyDirs(),
  ])
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
          <VAlert
            v-if="classificationLoadError"
            type="error"
            variant="tonal"
            class="mb-4"
            data-testid="directory-classification-load-error"
          >
            {{ classificationLoadError }}
          </VAlert>
          <VAlert
            v-if="directorySaveError"
            type="error"
            variant="tonal"
            class="mb-4"
            data-testid="directory-save-error"
          >
            {{ directorySaveError }}
          </VAlert>
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
              <VBtn color="info" variant="tonal" prepend-icon="mdi-file-tree" @click="openClassificationSettings">
                {{ t('setting.directory.classification.manage') }}
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
            <VCol cols="12" md="6">
              <VSwitch
                v-model="mountedLocalDiskDeleteEmptyDirs"
                :label="t('setting.directory.mountedLocalDiskDeleteEmptyDirs')"
                :hint="t('setting.directory.mountedLocalDiskDeleteEmptyDirsHint')"
                color="primary"
                persistent-hint
                inset
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
                  class="rename-format-editor__ace"
                  @init="configureAceEditorPadding"
                />
                <div class="rename-format-editor__hint">
                  {{ t('setting.directory.movieRenameFormatHint') }}
                </div>
              </div>
            </VCol>
            <VCol cols="12">
              <div class="rename-format-editor">
                <div class="rename-format-editor__label">
                  <VIcon icon="mdi-music-note" size="20" class="me-2" />
                  <span>{{ t('setting.directory.musicRenameFormat') }}</span>
                </div>
                <VAceEditor
                  v-model:value="musicRenameFormat"
                  lang="jinja2"
                  :theme="editorTheme"
                  :options="renameEditorOptions"
                  :print-margin="false"
                  :min-lines="4"
                  :max-lines="12"
                  wrap
                  class="rename-format-editor__ace"
                  @init="configureAceEditorPadding"
                />
                <div class="rename-format-editor__hint">
                  {{ t('setting.directory.musicRenameFormatHint') }}
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
                  class="rename-format-editor__ace"
                  @init="configureAceEditorPadding"
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

  <VDialog v-model="classificationDialogOpen" fullscreen scrollable class="classification-settings-dialog">
    <AccountSettingClassification
      v-if="classificationDialogMounted"
      :active="classificationDialogOpen"
      show-close
      @close="classificationDialogOpen = false"
    />
  </VDialog>
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
  border-radius: var(--app-field-radius);
  min-block-size: 8rem;
}

.rename-format-editor__hint {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.75rem;
  line-height: 1.25rem;
  margin-block-start: 0.375rem;
}
</style>
