import { defineAsyncComponent, type Component } from 'vue'
import api, { getApiBusinessErrorMessage } from '@/api'
import type { Context, FileItem, ManualScrapeOptions, Workflow } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { useRouter } from 'vue-router'
import { buildMusicDetailRoute } from '@/utils/music'
import { isMediaDataSource } from '@/utils/mediaId'
import { openSharedDialog } from './useSharedDialog'
import { useConfirm } from './useConfirm'
import type {
  PluginFileServices,
  PluginMediaIdentity,
  PluginMediaServices,
  PluginOperationResult,
  PluginPermission,
  PluginResourceServices,
  PluginWorkflowServices,
  NativeSubscriptionErrorCode,
} from '@/sdk/plugin'
import type { PluginSDKScope } from './usePluginSDKScope'

const MediaSelector = defineAsyncComponent(() => import('@/components/plugin-sdk/MediaSelectorDialog.vue'))
const MediaInfoDialog = defineAsyncComponent(() => import('@/components/dialog/MediaInfoDialog.vue'))
const FilePicker = defineAsyncComponent(() => import('@/components/plugin-sdk/FilePickerDialog.vue'))
const AddDownload = defineAsyncComponent(() => import('@/components/dialog/AddDownloadDialog.vue'))
const Reorganize = defineAsyncComponent(() => import('@/components/dialog/ReorganizeDialog.vue'))
const Scrape = defineAsyncComponent(() => import('@/components/dialog/ScrapeDialog.vue'))
const Progress = defineAsyncComponent(() => import('@/components/dialog/ProgressDialog.vue'))
const WorkflowEdit = defineAsyncComponent(() => import('@/components/dialog/WorkflowAddEditDialog.vue'))
const WorkflowDesign = defineAsyncComponent(() => import('@/components/dialog/WorkflowActionsDialog.vue'))
const WorkflowExecution = defineAsyncComponent(() => import('@/components/plugin-sdk/WorkflowExecutionDialog.vue'))
const SystemLogs = defineAsyncComponent(() => import('@/components/dialog/ShortcutLogDialog.vue'))
const result = (status: 'opened' | 'completed'): PluginOperationResult => ({ success: true, status })

/** 在现有原生组件外增加稳定的参数和生命周期合同，不复制内部业务。 */
export function usePluginNativeActions(scope: PluginSDKScope) {
  const router = useRouter()
  const { t } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  function errorResult(error: unknown): PluginOperationResult<never> {
    const code = (error as { code?: string })?.code
    return {
      success: false,
      code: (['INVALID_REQUEST', 'PERMISSION_DENIED', 'HOST_DISPOSED', 'CANCELLED'].includes(code || '')
        ? code
        : 'REQUEST_FAILED') as NativeSubscriptionErrorCode,
      message: getApiBusinessErrorMessage(error) || t('subscribe.requestFailed'),
      cancelled: code === 'CANCELLED' || code === 'HOST_DISPOSED',
    }
  }
  async function run<T>(
    permission: PluginPermission | undefined,
    action: (check: () => void) => Promise<PluginOperationResult<T>>,
    feature?: string,
  ): Promise<PluginOperationResult<T>> {
    try {
      return await action(scope.capture(permission, feature))
    } catch (error) {
      return errorResult(error)
    }
  }
  async function notifyChanged(check: () => void, callback?: () => unknown) {
    check()
    try {
      await callback?.()
    } catch (error) {
      console.error('Plugin SDK refresh:', error)
    }
  }
  function open(
    component: Component,
    props: Record<string, unknown>,
    check: () => void,
    events: Record<string, (...args: never[]) => unknown> = {},
    closeOn = ['close'],
  ) {
    check()
    const handlers: Record<string, (...args: never[]) => unknown> = {}
    for (const event of new Set([...Object.keys(events), ...closeOn]))
      handlers[event] = (...args) => {
        if (closeOn.includes(event)) stop()
        try {
          check()
          Promise.resolve(events[event]?.(...args)).catch(error => {
            try {
              check()
              toast.error(getApiBusinessErrorMessage(error) || t('subscribe.requestFailed'))
            } catch {
              /* 宿主失效后不提示旧任务。 */
            }
          })
        } catch {
          /* 宿主失效或权限已撤销。 */
        }
      }
    const controller = openSharedDialog(component, props, handlers, { closeOn })
    const stop = scope.track(() => controller.close())
    return { close: stop, updateProps: controller.updateProps }
  }
  function choose<T>(
    component: Component,
    props: Record<string, unknown>,
    check: () => void,
    transform: (value: never) => T,
  ): Promise<PluginOperationResult<T>> {
    check()
    return new Promise(resolve => {
      let settled = false
      const settle = (value: PluginOperationResult<T>) => {
        if (settled) return
        settled = true
        stop()
        resolve(value)
      }
      const controller = openSharedDialog(
        component,
        props,
        {
          select: value => {
            try {
              check()
              settle({ success: true, status: 'completed', data: transform(value as never) })
            } catch (error) {
              settle(errorResult(error))
            }
          },
          close: () => settle({ success: false, code: 'CANCELLED', cancelled: true }),
        },
        { closeOn: ['close', 'select'] },
      )
      const stop = scope.track(() => {
        controller.close()
        settle({ success: false, code: 'HOST_DISPOSED', cancelled: true })
      })
    })
  }
  function identity(media: PluginMediaIdentity) {
    if (
      !media ||
      !isMediaDataSource(media.media_source) ||
      !String(media.media_id ?? '').trim() ||
      String(media.media_id) === '0'
    )
      scope.fail('INVALID_REQUEST')
    return { ...media, media_id: String(media.media_id) }
  }
  function files(items: FileItem[]) {
    if (
      !Array.isArray(items) ||
      !items.length ||
      items.some(item => !item || !item.storage || !item.path || !['dir', 'file'].includes(item.type))
    )
      scope.fail('INVALID_REQUEST')
    return items.map(item => ({ ...item }))
  }
  const media: PluginMediaServices = {
    detail: media =>
      run(undefined, async () => {
        const target = identity(media)
        await router.push(
          target.type === '音乐'
            ? buildMusicDetailRoute(target)
            : { path: '/media', query: { ...target, media_id: String(target.media_id) } },
        )
        return result('completed')
      }),
    select: options =>
      run(undefined, async check => {
        if (!options || !isMediaDataSource(options.media_source)) scope.fail('INVALID_REQUEST')
        return choose(
          MediaSelector,
          { mediaSource: options.media_source, keyword: options.keyword, musicTypes: options.musicTypes },
          check,
          (selected: {
            id: string
            title: string
            poster?: string
            type?: string
            music_type?: 'recording' | 'album' | 'artist'
          }) => ({ ...selected, media_source: options.media_source, media_id: selected.id }),
        )
      }),
    recognize: options =>
      run(
        'manage',
        async check => {
          if (!options?.path?.trim()) scope.fail('INVALID_REQUEST')
          const context = await api.get<Context>('media/recognize_file', {
            params: { path: options.path },
            feedback: 'silent',
          })
          check()
          if (!context) scope.fail('REQUEST_FAILED')
          open(MediaInfoDialog, { context }, check)
          return result('opened')
        },
        'manage.filemanager',
      ),
  }
  const resources: PluginResourceServices = {
    search: options =>
      run(
        'search',
        async () => {
          if (!options || (!options.keyword?.trim() && !options.media)) scope.fail('INVALID_REQUEST')
          const target = options.media ? identity(options.media) : undefined
          await router.push({
            path: '/resource',
            query: {
              ...target,
              title: target?.title || options.keyword,
              keyword: options.keyword,
              area: 'title',
              sites: options.sites?.join(','),
            },
          })
          return result('completed')
        },
        'search.resource',
      ),
    download: options =>
      run(undefined, async check => {
        const authorize = () => {
          check()
          if (!scope.can('search', 'search.resource') && !scope.can('manage', 'manage.downloading'))
            scope.fail('PERMISSION_DENIED')
        }
        authorize()
        if (!options || (!options.torrent && !options.media && !options.title)) scope.fail('INVALID_REQUEST')
        open(AddDownload, { ...options, media: options.media ? identity(options.media) : undefined }, authorize, {}, [
          'close',
          'done',
        ])
        return result('opened')
      }),
  }

  const fileServices: PluginFileServices = {
    browse: () =>
      run(
        'manage',
        async check => {
          check()
          await router.push('/filemanager')
          return result('completed')
        },
        'manage.filemanager',
      ),
    select: (options = {}) =>
      run('manage', check => choose(FilePicker, { ...options }, check, value => value), 'manage.filemanager'),
    reorganize: options =>
      run(
        'manage',
        async check => {
          const items = files(options?.items)
          open(
            Reorganize,
            { items, target_storage: options.targetStorage, target_path: options.targetPath },
            check,
            {},
            ['close', 'done'],
          )
          return result('opened')
        },
        'manage.filemanager',
      ),
    scrape: options =>
      run(
        'manage',
        async check => {
          const items = files(options?.items)
          open(
            Scrape,
            { items },
            check,
            {
              scrape: async (conditions: ManualScrapeOptions) => {
                const progress = open(Progress, {}, check)
                try {
                  for (const [index, item] of items.entries()) {
                    check()
                    progress.updateProps({ text: item.path, value: Math.round((index / items.length) * 100) })
                    await api.post(`media/scrape/${encodeURIComponent(item.storage)}`, item, {
                      params: conditions,
                      feedback: 'silent',
                    })
                  }
                  await notifyChanged(check, options.onChanged)
                } finally {
                  progress.close()
                }
              },
            },
            ['close', 'scrape'],
          )
          return result('opened')
        },
        'manage.filemanager',
      ),
  }
  const workflows: PluginWorkflowServices = {
    manage: request =>
      run(
        'manage',
        async check => {
          if (!request || !['create', 'edit', 'design', 'run', 'execution', 'logs'].includes(request.action))
            scope.fail('INVALID_REQUEST')
          if (request.action === 'logs') {
            if (!scope.can('admin')) scope.fail('PERMISSION_DENIED')
            open(SystemLogs, {}, check)
            return result('opened')
          }
          const changed = () => notifyChanged(check, request.onChanged)
          if (request.action === 'create') {
            open(WorkflowEdit, {}, check, { save: changed }, ['save', 'close'])
            return result('opened')
          }
          if (!Number.isSafeInteger(request.workflowId) || (request.workflowId || 0) <= 0) scope.fail('INVALID_REQUEST')
          const workflow = await api.get<Workflow>(`workflow/${request.workflowId}`, { feedback: 'silent' })
          check()
          if (!workflow?.id || String(workflow.id) !== String(request.workflowId)) scope.fail('INVALID_REQUEST')
          if (request.action === 'run') {
            if (!(await confirm({ title: workflow.name, content: workflow.description || workflow.name })))
              scope.fail('CANCELLED')
            check()
            await api.post(`workflow/${request.workflowId}/run`, undefined, {
              params: { from_begin: request.fromBeginning ?? true },
              feedback: 'silent',
            })
            await notifyChanged(check, request.onChanged)
            return result('completed')
          }
          open(
            request.action === 'edit' ? WorkflowEdit : request.action === 'design' ? WorkflowDesign : WorkflowExecution,
            { workflow },
            check,
            { save: changed },
            ['save', 'close'],
          )
          return result('opened')
        },
        'manage.workflow',
      ),
  }
  return { media, resources, files: fileServices, workflows }
}
