import { defineComponent, h, nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import vuetify from '@/plugins/vuetify'
import { PluginHostBridgeClient } from '../bridgeClient'
import PluginShellHost from '../PluginShellHost.vue'
import { createBridgeScopedApi, normalizeScopedApiPath } from '../scopedApi'
import { PLUGIN_HOST_PROTOCOL, PLUGIN_HOST_PROTOCOL_MAJOR, type WebToHostEnvelope } from '../types'
import { cleanOpaquePluginRoots, getDefaultVisualTokens } from '../visualTheme'

const remoteMocks = vi.hoisted(() => ({
  setFederationRemote: vi.fn(),
  getFederationRemote: vi.fn(),
}))

vi.mock('@/utils/federationRuntime', () => ({
  setFederationRemote: remoteMocks.setFederationRemote,
  getFederationRemote: remoteMocks.getFederationRemote,
  unwrapFederationDefault: (mod: unknown) =>
    mod && typeof mod === 'object' && 'default' in mod ? (mod as { default: unknown }).default : mod,
}))

describe('plugin-shell local runtime', () => {
  const sentMessages: WebToHostEnvelope[] = []

  beforeEach(() => {
    sentMessages.length = 0
    remoteMocks.setFederationRemote.mockReset()
    remoteMocks.getFederationRemote.mockReset()
    window.localStorage.clear()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    window.__mpAndroidPluginHostV2 = {
      postMessage: raw => {
        sentMessages.push(JSON.parse(raw) as WebToHostEnvelope)
      },
    }
  })

  afterEach(() => {
    delete window.__mpAndroidPluginHostV2
  })

  it('normalizes scoped API paths and rejects path traversal or cross-origin URLs', () => {
    expect(normalizeScopedApiPath('plugin/BrushFlow/status', 'BrushFlow_2', 'BrushFlow')).toBe(
      '/api/v1/plugin/BrushFlow_2/status',
    )
    expect(normalizeScopedApiPath('/api/v1/system/env')).toBe('/api/v1/system/env')
    expect(() => normalizeScopedApiPath('../etc/passwd')).toThrow(/Path traversal/)
    expect(() => normalizeScopedApiPath('https://evil.example/api/v1/system/env')).toThrow(/Cross-origin/)
  })

  it('proxies scoped API calls through native bridge without storing Bearer tokens', async () => {
    const bridge = new PluginHostBridgeClient()
    const dispatched: WebToHostEnvelope[] = []
    window.__mpAndroidPluginHostV2 = {
      postMessage: raw => {
        const msg = JSON.parse(raw) as WebToHostEnvelope
        dispatched.push(msg)
        if (msg.type === 'api.request') {
          bridge.receiveFromHost({
            protocol: PLUGIN_HOST_PROTOCOL,
            major: PLUGIN_HOST_PROTOCOL_MAJOR,
            type: 'bridge.response',
            payload: {
              requestId: String(msg.payload.requestId),
              ok: true,
              data: { status: 200, body: { hello: 'world' } },
            },
          })
        }
      },
    }

    const api = createBridgeScopedApi(bridge, () => ({ pluginId: 'DemoClone', sourcePluginId: 'Demo' }))
    const data = await api.get<{ hello: string }>('plugin/Demo/info', { params: { page: 1 } })
    expect(data).toEqual({ hello: 'world' })
    expect(dispatched[0].type).toBe('api.request')
    expect(dispatched[0].payload.path).toBe('/api/v1/plugin/DemoClone/info')
    expect(window.localStorage.getItem('auth')).toBeNull()
  })

  it('cleans opaque full-width plugin root wrappers while preserving cards and image backgrounds', () => {
    const stage = document.createElement('div')
    const opaqueRoot = document.createElement('div')
    opaqueRoot.style.backgroundColor = 'rgb(255, 255, 255)'
    const innerCard = document.createElement('div')
    innerCard.className = 'v-card'
    innerCard.style.backgroundColor = 'rgb(30, 30, 46)'
    const heroWithImg = document.createElement('div')
    heroWithImg.style.backgroundColor = 'rgb(20, 20, 30)'
    heroWithImg.style.backgroundImage = 'url("https://example.test/bg.png")'
    opaqueRoot.appendChild(innerCard)
    opaqueRoot.appendChild(heroWithImg)
    stage.appendChild(opaqueRoot)
    document.body.appendChild(stage)

    const count = cleanOpaquePluginRoots(stage)
    expect(count).toBe(1)
    expect(opaqueRoot.getAttribute('data-mp-shell-transparent-root')).toBe('true')
    expect(innerCard.getAttribute('data-mp-shell-transparent-root')).toBeNull()
    expect(heroWithImg.getAttribute('data-mp-shell-transparent-root')).toBeNull()

    stage.remove()
  })

  it('emits shell.ready, mounts & unmounts remote plugin, updates theme, and reports errors cleanly', async () => {
    const DemoRemote = defineComponent({
      name: 'DemoRemotePage',
      props: {
        pluginId: String,
        hostSdk: Object,
      },
      setup(props) {
        return () =>
          h('div', { class: 'demo-remote-root', style: { backgroundColor: 'rgb(255, 255, 255)' } }, [
            h('span', { class: 'demo-pid' }, props.pluginId || ''),
          ])
      },
    })
    remoteMocks.getFederationRemote.mockResolvedValue({ default: DemoRemote })

    const wrapper = mount(PluginShellHost, {
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })

    expect(sentMessages.some(m => m.type === 'shell.ready')).toBe(true)

    window.__mpPluginHostReceive?.({
      protocol: PLUGIN_HOST_PROTOCOL,
      major: PLUGIN_HOST_PROTOCOL_MAJOR,
      type: 'plugin.mount',
      payload: {
        mountId: 'm-1',
        pluginId: 'BrushFlow',
        pluginName: '刷流工作台',
        surface: 'dataPage',
        remoteEntryUrl: '/plugin-remote/BrushFlow/1.2.0/assets/remoteEntry.js',
        visualTokens: getDefaultVisualTokens(),
        locale: 'zh-CN',
        user: {
          id: 1,
          userName: 'admin',
          superUser: true,
          level: 2,
          permissions: { discovery: true, search: true, subscribe: true, manage: true, admin: true },
        },
      },
    })

    await new Promise(resolve => setTimeout(resolve, 40))
    await nextTick()

    expect(wrapper.find('.demo-pid').text()).toBe('BrushFlow')
    expect(sentMessages.some(m => m.type === 'plugin.mounted' && m.payload.mountId === 'm-1')).toBe(true)
    expect(window.localStorage.getItem('auth')).toBeNull()
    expect(window.localStorage.getItem('user')).toContain('"userName":"admin"')

    // 实时切换浅色主题不刷新页面
    window.__mpPluginHostReceive?.({
      protocol: PLUGIN_HOST_PROTOCOL,
      major: PLUGIN_HOST_PROTOCOL_MAJOR,
      type: 'theme.update',
      payload: {
        visualTokens: { ...getDefaultVisualTokens(), mode: 'light', accentHex: '#47A3FA' },
      },
    })
    await nextTick()
    expect(document.documentElement.dataset.mpShellTheme).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--mp-accent')).toBe('#47A3FA')

    // 卸载回到空闲态
    window.__mpPluginHostReceive?.({
      protocol: PLUGIN_HOST_PROTOCOL,
      major: PLUGIN_HOST_PROTOCOL_MAJOR,
      type: 'plugin.unmount',
      payload: { mountId: 'm-1' },
    })
    await nextTick()
    expect(wrapper.find('.demo-pid').exists()).toBe(false)

    // 远程加载失败时回传 plugin.error
    remoteMocks.getFederationRemote.mockRejectedValueOnce(new Error('Remote chunk missing'))
    window.__mpPluginHostReceive?.({
      protocol: PLUGIN_HOST_PROTOCOL,
      major: PLUGIN_HOST_PROTOCOL_MAJOR,
      type: 'plugin.mount',
      payload: {
        mountId: 'm-err',
        pluginId: 'BrokenPlugin',
        surface: 'config',
        remoteEntryUrl: '/plugin-remote/BrokenPlugin/1.0.0/assets/remoteEntry.js',
        visualTokens: getDefaultVisualTokens(),
      },
    })
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(
      sentMessages.some(m => m.type === 'plugin.error' && m.payload.mountId === 'm-err' && m.payload.stage === 'load'),
    ).toBe(true)

    wrapper.unmount()
  })

  it('serializes reactive payloads as JSON strings for iOS WKScriptMessageHandler', () => {
    delete window.__mpAndroidPluginHostV2
    const iosPayloads: unknown[] = []
    window.webkit = {
      messageHandlers: {
        mpPluginHostV2: {
          postMessage: msg => iosPayloads.push(msg),
        },
      },
    }
    try {
      const bridge = new PluginHostBridgeClient()
      const reactiveActions = reactive([{ id: 'sdk_btn_1', label: '刷新状态', icon: 'mdi-refresh', disabled: false }])
      expect(bridge.send('ui.header', { title: 'Demo', subtitle: '', actions: reactiveActions })).toBe(true)
      expect(typeof iosPayloads[0]).toBe('string')
      const parsed = JSON.parse(String(iosPayloads[0])) as WebToHostEnvelope
      expect(parsed.type).toBe('ui.header')
      expect((parsed.payload.actions as Array<{ label: string }>)[0].label).toBe('刷新状态')
    } finally {
      delete window.webkit
    }
  })
})
