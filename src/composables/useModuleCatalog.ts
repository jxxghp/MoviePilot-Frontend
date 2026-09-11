import { computed, ref } from 'vue'
import api from '@/api'
import type { ModuleCatalogInfo } from '@/api/types'

export type ModuleCatalogType = 'downloader' | 'mediaserver' | 'notification' | string

export interface ModuleOption {
  moduleId: string
  title: string
  value: string
}

const moduleCatalog = ref<ModuleCatalogInfo[]>([])
const moduleCatalogLoaded = ref(false)
let moduleCatalogLoadPromise: Promise<void> | null = null

/** 加载后端宿主模块目录，并在当前页面会话中共享请求结果。 */
export function loadModuleCatalog(force = false): Promise<void> {
  if (force) moduleCatalogLoadPromise = null
  if (moduleCatalogLoadPromise) return moduleCatalogLoadPromise
  let loaded = false

  moduleCatalogLoadPromise = api
    .get<{ modules?: ModuleCatalogInfo[] }>('system/module-catalog')
    .then(result => {
      moduleCatalog.value = Array.isArray(result?.modules) ? result.modules : []
      moduleCatalogLoaded.value = true
      loaded = true
    })
    .catch(error => {
      console.warn('加载宿主模块目录失败：', error)
    })
    .finally(() => {
      if (!loaded) moduleCatalogLoadPromise = null
    })

  return moduleCatalogLoadPromise
}

/** 强制刷新模块目录，使模块开关或服务配置保存后立即更新选择器。 */
export function refreshModuleCatalog(): Promise<void> {
  return loadModuleCatalog(true)
}

/** 判断后端目录是否登记了指定的服务类型，包含当前已关闭的类型。 */
export function isRegisteredModuleOption(type: ModuleCatalogType, value: string): boolean {
  return moduleCatalog.value.some(item => item.type === type && item.option_value === value)
}

/** 返回当前模块目录，供非表单入口判断模块是否仍然可用。 */
export function getModuleCatalog() {
  return moduleCatalog
}

/** 判断模块目录是否已成功加载，失败时允许页面保留原有入口。 */
export function isModuleCatalogLoaded() {
  return moduleCatalogLoaded
}

/** 判断指定宿主模块当前是否处于可运行状态。 */
export function isModuleActive(moduleId: string): boolean {
  return moduleCatalog.value.some(item => item.id === moduleId && item.active)
}

/** 提供后端模块目录及按模块类别构造的选择器选项。 */
export function useModuleCatalog() {
  const moduleOptions = (type: ModuleCatalogType) =>
    computed<ModuleOption[]>(() =>
      moduleCatalog.value
        .filter(item => item.type === type && item.option_value && item.enabled)
        .map(item => ({
          moduleId: item.id,
          title: item.name_i18n || item.name,
          value: item.option_value as string,
        })),
    )

  return {
    catalog: moduleCatalog,
    moduleOptions,
    isRegisteredModuleOption,
    loadModuleCatalog,
    refreshModuleCatalog,
  }
}
