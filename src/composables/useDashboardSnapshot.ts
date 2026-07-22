import { useUserStore } from '@/stores'

export interface DashboardSnapshot<T> {
  /** 最后一次成功请求的完成时间。 */
  savedAt: number
  /** 卡片可直接恢复的完整成功结果。 */
  value: T
}

const DASHBOARD_SNAPSHOT_PREFIX = 'MP_DASHBOARD_SNAPSHOT_V1'
const DASHBOARD_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000

/**
 * 按登录用户保存仪表盘卡片的最后一次成功快照。
 *
 * @param key 卡片稳定标识，数据结构变更时应同步换版
 */
export function useDashboardSnapshot<T>(key: string) {
  const userStore = useUserStore()
  // 组件实例绑定创建时的登录用户，迟到响应不得写入之后登录的其他用户快照。
  const snapshotUserID = userStore.userID

  function getStorageKey() {
    if (snapshotUserID < 0) return undefined

    return `${DASHBOARD_SNAPSHOT_PREFIX}:${snapshotUserID}:${key}`
  }

  function clearSnapshot() {
    const storageKey = getStorageKey()
    if (storageKey) localStorage.removeItem(storageKey)
  }

  function readSnapshot(): DashboardSnapshot<T> | undefined {
    const storageKey = getStorageKey()
    if (!storageKey) return undefined

    const rawSnapshot = localStorage.getItem(storageKey)
    if (!rawSnapshot) return undefined

    try {
      const snapshot = JSON.parse(rawSnapshot) as Partial<DashboardSnapshot<T>>
      const age = Date.now() - Number(snapshot.savedAt)
      if (!Number.isFinite(age) || age < 0 || age > DASHBOARD_SNAPSHOT_TTL_MS || !('value' in snapshot)) {
        clearSnapshot()
        return undefined
      }

      return snapshot as DashboardSnapshot<T>
    } catch {
      clearSnapshot()
      return undefined
    }
  }

  function writeSnapshot(value: T) {
    const snapshot: DashboardSnapshot<T> = { savedAt: Date.now(), value }
    const storageKey = getStorageKey()
    if (!storageKey) return snapshot

    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot))
    } catch {
      // 快照是可选的首屏优化，存储不可用时仍以实时请求为准。
    }

    return snapshot
  }

  return { clearSnapshot, readSnapshot, writeSnapshot }
}
