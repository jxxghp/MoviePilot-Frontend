import { onScopeDispose, ref } from 'vue'

interface GlassWallpaperActivation<TPayload> {
  /** 由请求方保存、在原子激活回执时取回的业务载荷。 */
  payload: TPayload
  /** fixed 与 scroll context 共用的激活时间戳。 */
  startedAt: number
}

/**
 * 管理壁纸从请求、双 context 预备到原子激活的单调事务。
 * prepared 只解除资源等待；请求必须保留到 active 回执或显式取消。
 */
export function useGlassWallpaperTransaction<TPayload>(timeoutMs = 10_000) {
  const requestedUrl = ref('')
  const requestedRevision = ref(0)
  const activationRevision = ref(0)
  let revisionSequence = 0
  let revisionTimer: number | null = null
  let preparationResolve: ((ready: boolean) => void) | null = null
  let activationResolve: ((activated: boolean) => void) | null = null
  let activationPayload: TPayload | null = null

  function clearPreparationWait(ready: boolean) {
    const resolve = preparationResolve
    preparationResolve = null
    resolve?.(ready)
  }

  function clearActivationWait(activated: boolean) {
    const resolve = activationResolve
    activationResolve = null
    activationPayload = null
    activationRevision.value = 0
    resolve?.(activated)
  }

  function clearRevisionTimer() {
    if (revisionTimer === null) return

    window.clearTimeout(revisionTimer)
    revisionTimer = null
  }

  /** 取消当前 revision；迟到的 prepared/active 回执不能影响后续事务。 */
  function cancel(revision = requestedRevision.value) {
    if (revision !== requestedRevision.value) return false

    clearRevisionTimer()
    clearPreparationWait(false)
    clearActivationWait(false)
    requestedUrl.value = ''
    requestedRevision.value = 0

    return true
  }

  /** 开始新的壁纸准备事务，并使上一事务的所有等待者立即失效。 */
  function requestPreparation(url: string) {
    cancel()
    const revision = ++revisionSequence
    requestedUrl.value = url
    requestedRevision.value = revision

    return new Promise<boolean>(resolve => {
      preparationResolve = resolve
      revisionTimer = window.setTimeout(() => cancel(revision), timeoutMs)
    })
  }

  /** 只有当前 URL 与 revision 的 prepared 回执可以解除准备等待。 */
  function acknowledgePrepared(url: string, revision: number) {
    if (url !== requestedUrl.value || revision !== requestedRevision.value) return false

    clearPreparationWait(true)

    return true
  }

  /** 请求 Layer 在同一绘制帧内激活两个 context 已准备的资源。 */
  function requestActivation(payload: TPayload, revision = requestedRevision.value) {
    if (!requestedUrl.value || revision <= 0 || revision !== requestedRevision.value) {
      return Promise.resolve(false)
    }

    clearActivationWait(false)
    activationPayload = payload
    activationRevision.value = revision

    return new Promise<boolean>(resolve => {
      activationResolve = resolve
    })
  }

  /** 接受双 context 的原子 active 回执，并将请求载荷交还给父层提交 DOM。 */
  function acknowledgeActivated(
    url: string,
    revision: number,
    startedAt: number,
  ): GlassWallpaperActivation<TPayload> | null {
    if (
      url !== requestedUrl.value ||
      revision !== requestedRevision.value ||
      revision !== activationRevision.value ||
      activationPayload === null
    ) {
      return null
    }

    const activation = { payload: activationPayload, startedAt }
    clearRevisionTimer()
    clearPreparationWait(true)
    clearActivationWait(true)
    requestedUrl.value = ''
    requestedRevision.value = 0

    return activation
  }

  onScopeDispose(cancel)

  return {
    acknowledgeActivated,
    acknowledgePrepared,
    activationRevision,
    cancel,
    requestedRevision,
    requestedUrl,
    requestActivation,
    requestPreparation,
  }
}
