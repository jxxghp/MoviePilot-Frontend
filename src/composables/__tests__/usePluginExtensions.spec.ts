import { defineComponent, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@tests/support/render'
import { useUserStore } from '@/stores'
import { usePluginSDKScope } from '@/composables/usePluginSDKScope'
import { usePluginDataServices } from '@/composables/usePluginDataServices'
import { usePluginNativeActions } from '@/composables/usePluginNativeActions'
import { usePluginShellServices } from '@/composables/usePluginShellServices'
import { dynamicButtonRegistry } from '@/composables/dynamicButtonRegistry'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  open: vi.fn(),
  confirm: vi.fn(),
  toast: vi.fn(),
  storage: vi.fn(),
  download: vi.fn(),
  directories: vi.fn(),
  rules: vi.fn(),
  stream: {
    addMessageListener: vi.fn(),
    removeMessageListener: vi.fn(),
    addStatusListener: vi.fn(),
    removeStatusListener: vi.fn(),
    forceReconnect: vi.fn(),
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  header: vi.fn(),
  unheader: vi.fn(),
}))
vi.mock('@/api', () => ({
  default: { get: mocks.get, post: mocks.post },
  getApiBusinessErrorMessage: (error: unknown) => (error instanceof Error ? error.message : undefined),
}))
vi.mock('@/api/storage', () => ({
  listStorageOptions: mocks.storage,
  listDownloadDirectories: mocks.download,
  listTransferDirectories: mocks.directories,
}))
vi.mock('@/api/rule', () => ({ listFilterRuleGroups: mocks.rules }))
vi.mock('@/composables/useSharedDialog', () => ({ openSharedDialog: mocks.open }))
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('vue-toastification', () => ({ useToast: () => ({ error: mocks.toast }) }))
vi.mock('@/utils/sseManager', () => ({
  sseManagerSingleton: { getIndependentManager: mocks.connect, closeIndependentManager: mocks.disconnect },
}))

async function harness() {
  const id = ref('Demo_2')
  let services!: ReturnType<typeof usePluginDataServices> &
    ReturnType<typeof usePluginNativeActions> &
    ReturnType<typeof usePluginShellServices>
  const view = await renderWithProviders(
    defineComponent({
      setup() {
        const scope = usePluginSDKScope(id)
        services = {
          ...usePluginDataServices(scope),
          ...usePluginNativeActions(scope),
          ...usePluginShellServices(scope, true),
        }
        return () => null
      },
    }),
    {
      initialState: {
        user: {
          userID: 7,
          userName: 'tester',
          superUser: false,
          permissions: { discovery: true, search: true, subscribe: true, manage: true, features: {} },
        },
      },
      initialRoute: '/plugin-app/Demo_2/test',
      routes: ['/plugin-app/:id/:nav?', '/resource', '/media', '/filemanager', '/music/album', '/workflow'].map(
        path => ({ path, component: { render: () => null } }),
      ),
      global: { provide: { registerDynamicHeaderTab: mocks.header, unregisterDynamicHeaderTab: mocks.unheader } },
    },
  )
  return { ...view, services, id, user: useUserStore(view.pinia) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.open.mockReturnValue({ id: 1, close: vi.fn(), updateProps: vi.fn() })
  mocks.confirm.mockResolvedValue(true)
  mocks.connect.mockReturnValue(mocks.stream)
  mocks.get.mockResolvedValue({ value: 'saved' })
  mocks.post.mockResolvedValue(null)
  dynamicButtonRegistry.unregister()
})

describe('插件 SDK 数据、环境及流', () => {
  it('仅投影公共目录和选项字段，不泄露连接参数', async () => {
    const { services, unmount } = await harness()
    mocks.storage.mockResolvedValue([{ type: 'local', name: '本地', token: 'not-public' }])
    mocks.download.mockResolvedValue([
      { name: '下载', storage: 'local', save_path: '/downloads', privateConfig: 'not-public' },
    ])
    mocks.directories.mockResolvedValue([{ name: '整理', storage: 'local', library_path: '/library', priority: 1 }])
    mocks.rules.mockResolvedValue([{ name: '高清', rule_string: 'private-implementation' }])
    mocks.get.mockResolvedValue([{ media_source: 'themoviedb', name: 'TMDB', media_types: ['电影'] }])
    expect(await services.catalogs.storages()).toEqual([{ id: 'local', name: '本地' }])
    expect(await services.catalogs.downloadDirectories()).toEqual([
      expect.objectContaining({ name: '下载', path: '/downloads' }),
    ])
    expect(await services.catalogs.directories({ directory_type: 'library' })).toEqual([
      expect.objectContaining({ libraryPath: '/library' }),
    ])
    expect(mocks.directories).toHaveBeenCalledWith({ directory_type: 'library' })
    expect(await services.catalogs.ruleGroups()).toEqual([{ id: '高清', name: '高清' }])
    expect(await services.catalogs.mediaSources()).toEqual([{ id: 'themoviedb', name: 'TMDB', mediaTypes: ['电影'] }])
    unmount()
  })
  it('偏好使用用户配置及实例命名空间，拒绝路径与超大值', async () => {
    const { services, id, unmount } = await harness()
    await services.preferences.set('filters', { q: 1 })
    expect(mocks.post).toHaveBeenCalledWith(
      'user/config/PluginFrontend.Demo_2.filters',
      { q: 1 },
      { feedback: 'silent' },
    )
    expect(await services.preferences.get('filters')).toBe('saved')
    id.value = 'Demo_3'
    await services.preferences.remove('filters')
    expect(mocks.post).toHaveBeenLastCalledWith('user/config/PluginFrontend.Demo_3.filters', null, {
      feedback: 'silent',
    })
    await expect(services.preferences.set('../escape', 1)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(services.preferences.set('huge', '好'.repeat(6000))).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(mocks.post).toHaveBeenCalledTimes(2)
    unmount()
  })
  it('账号或实例切换后拒绝旧偏好读取的迟到结果', async () => {
    const { services, id, unmount } = await harness()
    let resolve!: (value: unknown) => void
    mocks.get.mockReturnValueOnce(
      new Promise(done => {
        resolve = done
      }),
    )
    const pending = services.preferences.get('filters')
    id.value = 'Demo_3'
    resolve({ value: 'old' })
    await expect(pending).rejects.toMatchObject({ code: 'HOST_DISPOSED' })
    unmount()
  })
  it('环境快照只读且订阅可取消，功能权限即时生效', async () => {
    const { services, user, unmount } = await harness()
    const listener = vi.fn()
    const stop = services.environment.subscribe(listener)
    expect(listener).toHaveBeenCalledOnce()
    expect(Object.isFrozen(listener.mock.calls[0][0].user)).toBe(true)
    user.permissions.features = { 'search.resource': false }
    await nextTick()
    expect(services.environment.hasPermission('search', 'search.resource')).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    user.userName = 'new-user'
    await nextTick()
    expect(listener).toHaveBeenCalledTimes(2)
    unmount()
  })
  it('流按实例映射，切换账号自动关闭，旧消息不再回调', async () => {
    const { services, user, unmount } = await harness()
    const onMessage = vi.fn()
    const stream = services.events.subscribe({ path: 'plugin/Demo/stream', onMessage })
    expect(mocks.connect.mock.calls[0][0]).toContain('/plugin/Demo_2/stream')
    const handle = mocks.stream.addMessageListener.mock.calls[0][1]
    handle({ data: 'hello', type: 'message', lastEventId: '1' })
    expect(onMessage).toHaveBeenCalledWith({ data: 'hello', type: 'message', lastEventId: '1' })
    stream.reconnect()
    expect(mocks.stream.forceReconnect).toHaveBeenCalledOnce()
    user.userID = 8
    expect(mocks.disconnect).toHaveBeenCalledOnce()
    handle({ data: 'late' })
    expect(onMessage).toHaveBeenCalledOnce()
    stream.close()
    expect(mocks.disconnect).toHaveBeenCalledOnce()
    unmount()
  })
  it.each([
    'https://elsewhere.invalid/events',
    '//elsewhere/events',
    '../events',
    'events?token=secret',
    '/api/v1/events',
  ])('拒绝不支持的流地址 %s', async path => {
    const { services, unmount } = await harness()
    expect(() => services.events.subscribe({ path, onMessage: vi.fn() })).toThrow()
    expect(mocks.connect).not.toHaveBeenCalled()
    unmount()
  })
})

describe('插件 SDK 原生业务入口', () => {
  it('按媒体身份进入原生详情和资源搜索，不依赖订阅 ID', async () => {
    const { services, router, unmount } = await harness()
    expect(await services.media.detail({ media_source: 'themoviedb', media_id: 42, title: '演示' })).toMatchObject({
      success: true,
    })
    expect(router.currentRoute.value.query).toMatchObject({ media_source: 'themoviedb', media_id: '42' })
    await services.resources.search({ keyword: '演示', sites: [1, 2] })
    expect(router.currentRoute.value.query).toMatchObject({ keyword: '演示', sites: '1,2' })
    unmount()
  })
  it('选择媒体返回统一身份，遮罩取消与卸载都结算 Promise', async () => {
    const { services, unmount } = await harness()
    const pending = services.media.select({ media_source: 'douban' })
    mocks.open.mock.calls[0][2].select({ id: '42', title: '演示' })
    expect(await pending).toMatchObject({
      success: true,
      data: { media_source: 'douban', media_id: '42', title: '演示' },
    })
    const cancelled = services.files.select()
    mocks.open.mock.calls[1][2].close()
    expect(await cancelled).toMatchObject({ success: false, code: 'CANCELLED' })
    const disposed = services.files.select()
    unmount()
    expect(await disposed).toMatchObject({ success: false, code: 'HOST_DISPOSED' })
  })
  it('资源和文件入口复用原生弹窗并保留云盘身份', async () => {
    const { services, unmount } = await harness()
    const item = {
      storage: 'u115',
      path: '/movie.mkv',
      name: 'movie.mkv',
      type: 'file',
      fileid: 'id',
      pickcode: 'pick',
    }
    expect(await services.resources.download({ title: '演示', torrent: { enclosure: 'magnet:test' } })).toMatchObject({
      success: true,
      status: 'opened',
    })
    expect(await services.files.reorganize({ items: [item], targetPath: '/library' })).toMatchObject({ success: true })
    expect(mocks.open.mock.calls[1][1]).toMatchObject({ items: [item], target_path: '/library' })
    const selection = services.files.select({ multiple: true })
    mocks.open.mock.calls[2][2].select([item])
    expect(await selection).toMatchObject({ data: [item] })
    unmount()
  })
  it('读取期间卸载不打开识别弹窗；功能权限不足不发起整理', async () => {
    const { services, user, unmount } = await harness()
    user.permissions.features = { 'manage.filemanager': false }
    expect(await services.files.reorganize({ items: [] })).toMatchObject({ success: false, code: 'PERMISSION_DENIED' })
    user.permissions.features = {}
    let resolve!: (value: unknown) => void
    mocks.get.mockReturnValueOnce(
      new Promise(done => {
        resolve = done
      }),
    )
    const pending = services.media.recognize({ path: '/movie.mkv' })
    unmount()
    resolve({ meta_info: { name: '演示' } })
    expect(await pending).toMatchObject({ success: false, code: 'HOST_DISPOSED' })
    expect(mocks.open).not.toHaveBeenCalled()
  })
  it('工作流重新读取授权记录，运行确认后再次检查权限', async () => {
    const { services, user, unmount } = await harness()
    mocks.get.mockResolvedValue({ id: '7', name: '演示工作流' })
    await services.workflows.manage({ action: 'design', workflowId: 7 })
    expect(mocks.open.mock.calls[0][1]).toMatchObject({ workflow: { id: '7' } })
    mocks.confirm.mockImplementationOnce(() => {
      user.permissions.manage = false
      return Promise.resolve(true)
    })
    expect(await services.workflows.manage({ action: 'run', workflowId: 7 })).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    })
    expect(mocks.post).not.toHaveBeenCalled()
    unmount()
  })
  it('工作流已提交成功后，插件刷新回调的异常不会误报执行失败', async () => {
    const { services, unmount } = await harness()
    mocks.get.mockResolvedValue({ id: '7', name: '演示工作流' })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(
        await services.workflows.manage({
          action: 'run',
          workflowId: 7,
          onChanged: () => {
            throw new Error('refresh-failed')
          },
        }),
      ).toMatchObject({ success: true, status: 'completed' })
      expect(mocks.post).toHaveBeenCalledOnce()
    } finally {
      log.mockRestore()
      unmount()
    }
  })

  it('刮削仅在用户确认参数后按每项存储提交', async () => {
    const { services, unmount } = await harness()
    const onChanged = vi.fn()
    const items = [{ storage: 'local', path: '/movie.mkv', name: 'movie.mkv', type: 'file' }]
    await services.files.scrape({ items, onChanged })
    expect(mocks.post).not.toHaveBeenCalled()
    mocks.open.mock.calls[0][2].scrape({ type: '电影' })
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
    expect(mocks.post).toHaveBeenCalledWith('media/scrape/local', items[0], {
      params: { type: '电影' },
      feedback: 'silent',
    })
    unmount()
  })
})

describe('插件 SDK 页面外壳', () => {
  it('旧按钮的注销不会删除新按钮，离开路由后命令失效', async () => {
    const { services, router, unmount } = await harness()
    const first = vi.fn(),
      second = vi.fn()
    const stop = services.shell!.registerButton!({ title: '旧', icon: 'mdi-plus', action: first })
    const old = dynamicButtonRegistry.registration.value!.button.action
    services.shell!.registerButton!({ title: '新', icon: 'mdi-plus', action: second })
    stop()
    old()
    expect(first).not.toHaveBeenCalled()
    expect(dynamicButtonRegistry.registration.value?.button.title).toBe('新')
    dynamicButtonRegistry.registration.value?.button.action()
    expect(second).toHaveBeenCalledOnce()
    await router.push('/resource')
    old()
    expect(first).not.toHaveBeenCalled()
    expect(dynamicButtonRegistry.registration.value).toBeNull()
    unmount()
  })
  it('页签可更新，销毁后注销自身所有权', async () => {
    const { services, unmount } = await harness()
    const onSelect = vi.fn()
    const controller = services.shell!.registerTabs!({
      items: [
        { title: '一', tab: 'one' },
        { title: '二', tab: 'two' },
      ],
      selected: 'one',
      onSelect,
    })
    controller.update('two')
    expect(mocks.header.mock.lastCall?.[0].modelValue).toBe('two')
    mocks.header.mock.lastCall?.[0].onUpdateModelValue('one')
    expect(onSelect).toHaveBeenCalledWith('one')
    const oldSelect = mocks.header.mock.lastCall?.[0].onUpdateModelValue
    controller.dispose()
    oldSelect('two')
    expect(onSelect).toHaveBeenCalledOnce()
    expect(() => controller.update('one')).toThrow('HOST_DISPOSED')
    expect(mocks.unheader).toHaveBeenCalledWith('/plugin-app/Demo_2/test', expect.stringContaining('plugin-sdk:'))
    unmount()
  })
  it('导航拒绝外部地址，内部导航保留查询并支持替换', async () => {
    const { services, router, unmount } = await harness()
    expect(await services.navigation.push({ path: '//elsewhere/' })).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
    })
    expect(await services.navigation.replace({ path: '/resource', query: { active: true, page: 2 } })).toMatchObject({
      success: true,
    })
    expect(router.currentRoute.value.query).toMatchObject({ active: 'true', page: '2' })
    unmount()
  })
})
