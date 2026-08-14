import api from '@/api'
import type { CategoryConfig, DirectoryMatchMode, DirectoryRouteSettings } from '@/api/types'
import { cloneDeep } from 'lodash-es'

const emptyCategoryConfig = (): CategoryConfig => ({ movie: {}, tv: {} })

export type RouteSettingsSaveResult = 'saved' | 'outdated' | 'failed'

/** 管理目录路由设置与分类配置的远端快照和本地草稿。 */
export function useDirectoryRouteSettings() {
  const directories = ref<DirectoryRouteSettings['directories']>([])
  const directoryMatchMode = ref<DirectoryMatchMode>('sequential')
  const routeSettingsLoaded = ref(false)
  const routeSettingsDirty = ref(false)
  const savingRouteSettings = ref(false)
  const categoryConfig = ref<CategoryConfig | null>(null)
  const categoryConfigLoaded = ref(false)
  const categoryConfigDirty = ref(false)

  let applyingRouteSettings = false
  let routeEditRevision = 0
  let routeLoadRequestId = 0
  let categoryLoadRequestId = 0

  watch(
    [directories, directoryMatchMode],
    () => {
      if (applyingRouteSettings || !routeSettingsLoaded.value) return
      routeEditRevision += 1
      routeSettingsDirty.value = true
    },
    { deep: true, flush: 'sync' },
  )

  function applyRouteSettings(settings: DirectoryRouteSettings) {
    applyingRouteSettings = true
    directories.value = cloneDeep(settings.directories)
    directoryMatchMode.value = settings.match_mode
    applyingRouteSettings = false
    routeSettingsDirty.value = false
  }

  async function loadRouteSettings() {
    const requestId = ++routeLoadRequestId
    try {
      const settings = await api.get<DirectoryRouteSettings>('transfer/route/settings', { feedback: 'silent' })
      if (requestId !== routeLoadRequestId) return
      routeSettingsLoaded.value = true
      if (!routeSettingsDirty.value && !savingRouteSettings.value) applyRouteSettings(settings)
    } catch (error) {
      console.log(error)
    }
  }

  async function saveRouteSettings(): Promise<RouteSettingsSaveResult> {
    if (!routeSettingsLoaded.value || savingRouteSettings.value) return 'failed'
    const snapshot: DirectoryRouteSettings = {
      directories: cloneDeep(directories.value),
      match_mode: directoryMatchMode.value,
    }
    const revision = routeEditRevision
    savingRouteSettings.value = true
    routeLoadRequestId += 1
    try {
      const saved = await api.post<DirectoryRouteSettings>('transfer/route/settings', snapshot, {
        feedback: 'silent',
      })
      if (routeEditRevision !== revision) return 'outdated'
      applyRouteSettings(saved)
      return 'saved'
    } catch (error) {
      console.log(error)
      return 'failed'
    } finally {
      routeLoadRequestId += 1
      savingRouteSettings.value = false
    }
  }

  async function loadCategoryConfig() {
    const requestId = ++categoryLoadRequestId
    try {
      const config =
        (await api.get<CategoryConfig | null>('media/category/config', { feedback: 'silent' })) ?? emptyCategoryConfig()
      if (requestId !== categoryLoadRequestId) return
      categoryConfigLoaded.value = true
      if (!categoryConfigDirty.value) categoryConfig.value = cloneDeep(config)
    } catch (error) {
      console.log(error)
    }
  }

  function setCategoryDraft(config: CategoryConfig) {
    categoryLoadRequestId += 1
    categoryConfig.value = cloneDeep(config)
    categoryConfigDirty.value = true
  }

  function markCategorySaved(config: CategoryConfig) {
    categoryLoadRequestId += 1
    categoryConfig.value = cloneDeep(config)
    categoryConfigLoaded.value = true
    categoryConfigDirty.value = false
  }

  return {
    categoryConfig,
    categoryConfigLoaded,
    directories,
    directoryMatchMode,
    loadCategoryConfig,
    loadRouteSettings,
    markCategorySaved,
    routeSettingsLoaded,
    saveRouteSettings,
    savingRouteSettings,
    setCategoryDraft,
  }
}
