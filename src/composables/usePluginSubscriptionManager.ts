import { defineAsyncComponent, onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import api, { getApiBusinessErrorMessage } from '@/api'
import { resetSubscription, searchSubscription } from '@/api/subscription'
import type { PluginSDKScope } from './usePluginSDKScope'
import type { Subscribe } from '@/api/types'
import { useConfirm } from '@/composables/useConfirm'
import { openSharedDialog } from '@/composables/useSharedDialog'
import {
  PLUGIN_SUBSCRIPTION_ACTIONS,
  type NativeSubscriptionManager,
  type NativeSubscriptionRequest,
} from '@/sdk/plugin'
export type {
  NativeSubscriptionAction,
  NativeSubscriptionRequest,
  NativeSubscriptionResult,
  NativeSubscriptionManager,
} from '@/sdk/plugin'
import router from '@/router'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { buildMusicDetailRoute } from '@/utils/music'

const SubscribeEditDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeEditDialog.vue'))
const SubscribeLogDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeLogDialog.vue'))
const SubscribeFilesDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeFilesDialog.vue'))
const SubscribeShareDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeShareDialog.vue'))
const SubscribeExecutionDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeExecutionDialog.vue'))
const SubscribeActivityDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeActivityDialog.vue'))

const actions = new Set<string>(PLUGIN_SUBSCRIPTION_ACTIONS)

/** 创建由主程序提供的订阅管理入口，复用原生弹窗、API、确认和通知。 */
export function usePluginSubscriptionManager(
  scope?: Pick<PluginSDKScope, 'capture' | 'track'>,
): NativeSubscriptionManager {
  const { t } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const userStore = useUserStore()
  const pending = new Set<number>()
  function openDialog(...args: Parameters<typeof openSharedDialog>) {
    const controller = openSharedDialog(...args)
    scope?.track(() => controller.close())
    return controller
  }
  let disposed = false
  onScopeDispose(() => {
    disposed = true
  })
  const canManage = () =>
    hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'subscribe')
  const inactiveResult = () => ({ success: false, code: 'HOST_DISPOSED', cancelled: true }) as const

  /** 刷新插件列表的异常不应把已经成功的宿主变更误报为失败。 */
  async function notifyChanged(request: NativeSubscriptionRequest, active: () => boolean) {
    if (!active()) return
    try {
      if (typeof request.onChanged === 'function') await request.onChanged()
    } catch (error) {
      console.error(error)
    }
  }

  return async request => {
    if (disposed) return inactiveResult()
    if (
      !request ||
      !actions.has(request.action) ||
      !Number.isSafeInteger(request.subscriptionId) ||
      request.subscriptionId <= 0
    )
      return { success: false, code: 'INVALID_REQUEST', message: t('subscribe.requestFailed') }
    if (!canManage()) {
      return { success: false, code: 'PERMISSION_DENIED', message: t('subscribe.native.permissionDenied') }
    }
    const id = request.subscriptionId
    if (pending.has(id)) return { success: false, code: 'BUSY', cancelled: true }
    pending.add(id)
    const username = userStore.userName
    let checkSession: (() => void) | undefined
    const active = () => {
      if (disposed || userStore.userName !== username) return false
      try {
        checkSession?.()
        return true
      } catch {
        return false
      }
    }
    try {
      checkSession = scope?.capture()
      // 不能信任远程卡片传入的媒体身份或 username；接口返回空记录时禁止后续操作。
      const subscription = await api.get<Subscribe>(`subscribe/${id}`, { feedback: 'silent' })
      if (!active()) return inactiveResult()
      if (!canManage())
        return { success: false, code: 'PERMISSION_DENIED', message: t('subscribe.native.permissionDenied') }
      if (subscription?.id !== id) throw new Error(t('subscribe.requestFailed'))
      if (request.action === 'edit') {
        const changed = () => notifyChanged(request, active)
        openDialog(
          SubscribeEditDialog,
          { subid: id },
          { save: changed, remove: changed },
          { closeOn: ['close', 'save', 'remove'] },
        )
        return { success: true, status: 'opened' }
      }
      if (request.action === 'activity') {
        openDialog(SubscribeActivityDialog, { subscription }, {}, { closeOn: ['close'] })
        return { success: true, status: 'opened' }
      }
      if (['logs', 'files', 'share', 'execution'].includes(request.action)) {
        if (request.action === 'execution' && !subscription.execution_status)
          return { success: false, code: 'INVALID_REQUEST' }
        const component =
          request.action === 'logs'
            ? SubscribeLogDialog
            : request.action === 'files'
              ? SubscribeFilesDialog
              : request.action === 'share'
                ? SubscribeShareDialog
                : SubscribeExecutionDialog
        const props =
          request.action === 'files'
            ? { subid: id }
            : request.action === 'share'
              ? { sub: subscription }
              : request.action === 'execution'
                ? { execution: subscription.execution_status, name: subscription.name }
                : { subscription }
        openDialog(component, props, {}, { closeOn: ['close'] })
        return { success: true, status: 'opened' }
      }
      if (request.action === 'detail') {
        if (subscription.type === '音乐') await router.push(buildMusicDetailRoute(subscription))
        else {
          if (!subscription.media_source || !subscription.media_id) throw new Error(t('subscribe.requestFailed'))
          await router.push({
            path: '/media',
            query: {
              media_source: subscription.media_source,
              media_id: String(subscription.media_id),
              title: subscription.name,
              year: subscription.year,
              type: subscription.type,
            },
          })
        }
        return { success: true, status: 'completed' }
      }
      if (request.action === 'search') {
        const submission = await searchSubscription(id)
        if (!active()) return inactiveResult()
        const ongoing = submission?.queued_count === 0 && submission?.ongoing_count
        const message = t(
          ongoing ? 'subscribe.execution.searchAlreadyRunning' : 'subscribe.execution.searchScheduled',
          { name: subscription.name },
        )
        if (ongoing) toast.info(message)
        else toast.success(message)
      } else {
        const action = t(
          request.action === 'pause'
            ? 'common.pause'
            : request.action === 'resume'
              ? 'common.enable'
              : request.action === 'delete'
                ? 'common.unsubscribe'
                : 'common.reset',
        )
        const content =
          request.action === 'reset'
            ? t('subscribe.resetConfirm', { name: subscription.name })
            : t('subscribe.confirmToggle', {
                action: request.action === 'delete' ? t('common.cancel') : action,
                name: subscription.name,
              })
        if (!(await confirm({ title: t('common.confirmAction', { action }), content }))) {
          return { success: false, code: 'CANCELLED', cancelled: true }
        }
        if (!active()) return inactiveResult()
        if (!canManage())
          return { success: false, code: 'PERMISSION_DENIED', message: t('subscribe.native.permissionDenied') }
        if (request.action === 'reset') await resetSubscription(id)
        else if (request.action === 'delete') await api.delete(`subscribe/${id}`, { feedback: 'silent' })
        else
          await api.put(`subscribe/status/${id}?state=${request.action === 'pause' ? 'S' : 'R'}`, undefined, {
            feedback: 'silent',
          })
        if (!active()) return inactiveResult()
        toast.success(
          request.action === 'reset'
            ? t('subscribe.resetSuccess', { name: subscription.name })
            : t('subscribe.toggleSuccess', { name: subscription.name, action }),
        )
      }
      await notifyChanged(request, active)
      return { success: true, status: 'completed' }
    } catch (error) {
      if (!active()) return inactiveResult()
      const message = getApiBusinessErrorMessage(error) || t('subscribe.requestFailed')
      toast.error(message)
      return { success: false, code: 'REQUEST_FAILED', message }
    } finally {
      pending.delete(id)
    }
  }
}
