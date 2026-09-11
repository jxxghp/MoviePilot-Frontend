import { ref } from 'vue'
import { listStorageCatalogOptions } from '@/api/storage'
import type { StorageCatalogOption } from '@/api/types'

const storageCatalog = ref<StorageCatalogOption[]>([])
let storageCatalogLoadPromise: Promise<void> | null = null

/** 加载后端存储类型目录，并在当前页面会话中共享请求结果。 */
export function loadStorageCatalog(force = false): Promise<void> {
  if (force) storageCatalogLoadPromise = null
  if (storageCatalogLoadPromise) return storageCatalogLoadPromise

  let loaded = false
  storageCatalogLoadPromise = listStorageCatalogOptions()
    .then(options => {
      storageCatalog.value = options
      loaded = true
    })
    .catch(error => {
      console.warn('加载存储类型目录失败：', error)
    })
    .finally(() => {
      if (!loaded) storageCatalogLoadPromise = null
    })

  return storageCatalogLoadPromise
}

/** 提供后端存储类型目录及按类型读取元数据的能力。 */
export function useStorageOptions() {
  return {
    catalog: storageCatalog,
    loadStorageCatalog,
  }
}
