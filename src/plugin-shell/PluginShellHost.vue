<script setup lang="ts">
import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onErrorCaptured,
  onMounted,
  ref,
  shallowRef,
  type Component,
} from 'vue'
import { useTheme } from 'vuetify'
import {
  getFederationRemote,
  setFederationRemote,
  unwrapFederationDefault,
} from '@/utils/federationRuntime'
import { pluginHostBridge } from './bridgeClient'
import {
  providePluginShellSDK,
  type InlineSharedDialogEntry,
  type PluginShellRuntimeState,
  type ShellHeaderCommandEntry,
} from './hostSdk'
import { createBridgeScopedApi, installSameOriginApiFetchShim } from './scopedApi'
import type {
  HostToWebEnvelope,
  NativeVisualTokens,
  PluginHeaderActionDescriptor,
  PluginMountPayload,
  PluginShellSurface,
  SafeAreaInsets,
} from './types'
import {
  applyNativeVisualTokens,
  applySafeAreaInsets,
  cleanOpaquePluginRoots,
  getDefaultVisualTokens,
} from './visualTheme'

const theme = useTheme()

const mountStageRef = ref<HTMLElement | null>(null)
const activeComponent = shallowRef<Component | null>(null)
const mountSessionId = ref('')
const currentMount = ref<PluginMountPayload | null>(null)
const activeSurface = ref<PluginShellSurface>('dataPage')
const initialConfigModel = ref<Record<string, unknown>>({})
const inlineDialogs = ref<InlineSharedDialogEntry[]>([])
const sdkHeaderCommands = shallowRef<ShellHeaderCommandEntry[]>([])
const domHeaderButtons = ref<Map<string, HTMLElement>>(new Map())

const runtimeState = ref<PluginShellRuntimeState>({
  pluginId: '',
  sourcePluginId: undefined,
  surface: 'dataPage',
  locale: 'zh-CN',
  theme: 'dark',
  user: {
    id: 0,
    userName: '',
    superUser: false,
    level: 1,
    permissions: {
      discovery: true,
      search: true,
      subscribe: true,
      manage: false,
      admin: false,
      features: {},
    },
  },
})

const scopedApi = createBridgeScopedApi(pluginHostBridge, () => ({
  pluginId: runtimeState.value.pluginId,
  sourcePluginId: runtimeState.value.sourcePluginId,
}))

installSameOriginApiFetchShim(pluginHostBridge, () => ({
  pluginId: runtimeState.value.pluginId,
  sourcePluginId: runtimeState.value.sourcePluginId,
}))

if (typeof window !== 'undefined') {
  ;(window as unknown as { MoviePilotAPI?: unknown }).MoviePilotAPI = scopedApi
}

const {
  sdk: hostSdk,
  toast,
  nativeSubscribe,
  subscriptionManager,
  notifyEnvironmentChanged,
  clearRegisteredCommands,
} = providePluginShellSDK({
  bridge: pluginHostBridge,
  api: scopedApi,
  state: runtimeState,
  dialogs: inlineDialogs,
  onHeaderCommandsChanged: entries => {
    sdkHeaderCommands.value = entries
    publishHeaderState()
  },
})

let mountGeneration = 0

function navKeyToPascalSegment(navKey: string): string {
  return navKey
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

function candidateExposesFor(surface: PluginShellSurface, navKey?: string): string[] {
  if (surface === 'config') return ['./Config']
  if (surface === 'dashboard') return ['./Dashboard']
  if (surface === 'dataPage') return ['./Page']
  const raw = (navKey || 'main').trim()
  if (!raw || raw.toLowerCase() === 'main') {
    return ['./AppPage', './Page']
  }
  const pascal = navKeyToPascalSegment(raw)
  return pascal ? [`./AppPage${pascal}`, './AppPage', './Page'] : ['./AppPage', './Page']
}

function writeSanitizedUserSnapshot(payload: PluginMountPayload): void {
  if (typeof window === 'undefined') return
  try {
    // 严格遵守安全边界：绝不向 localStorage 写入 auth/token，仅提供只读脱敏 user 快照。
    window.localStorage.removeItem('auth')
    if (payload.user) {
      window.localStorage.setItem(
        'user',
        JSON.stringify({
          superUser: Boolean(payload.user.superUser),
          userID: payload.user.id,
          userName: payload.user.userName,
          avatar: payload.user.avatar || '',
          level: payload.user.level,
          permissions: payload.user.permissions,
        }),
      )
    }
    if (payload.locale) {
      window.localStorage.setItem('MP_LOCALE', payload.locale)
    }
    if (payload.visualTokens?.mode) {
      window.localStorage.setItem('theme', payload.visualTokens.mode)
    }
  } catch {
    // 忽略沙箱存储不可用场景
  }
}

function publishHeaderState(): void {
  const mount = currentMount.value
  if (!mount) return
  const actions: PluginHeaderActionDescriptor[] = sdkHeaderCommands.value.map(item => item.descriptor)
  pluginHostBridge.updateHeader(mount.pluginName || mount.pluginId, '', actions)
}

function extractFallbackDomHeader(): void {
  const stage = mountStageRef.value
  if (!stage || sdkHeaderCommands.value.length > 0) return
  const mount = currentMount.value
  if (!mount) return
  const header = stage.querySelector('header, [data-native-dialog-header]')
  if (!(header instanceof HTMLElement)) return

  const heading = header.querySelector('h1, h2, h3, .v-card-title, .v-toolbar-title')
  const title = (heading?.textContent || '').trim() || mount.pluginName || mount.pluginId
  const map = new Map<string, HTMLElement>()
  const actions: PluginHeaderActionDescriptor[] = []
  let idx = 0
  for (const btn of Array.from(header.querySelectorAll('button'))) {
    if (!(btn instanceof HTMLElement)) continue
    const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim()
    if (!label || /^(关闭|close|×|✕)$/i.test(label)) continue
    idx += 1
    const id = `dom_hdr_${idx}`
    map.set(id, btn)
    actions.push({
      id,
      label,
      disabled: btn.hasAttribute('disabled'),
    })
  }
  domHeaderButtons.value = map
  if (title || actions.length > 0) {
    pluginHostBridge.updateHeader(title, '', actions)
  }
}

async function loadInitialConfigIfNeeded(payload: PluginMountPayload): Promise<void> {
  const passed = payload.props?.initialConfig
  if (passed && typeof passed === 'object') {
    initialConfigModel.value = passed as Record<string, unknown>
    return
  }
  if (payload.surface !== 'config') {
    initialConfigModel.value = {}
    return
  }
  try {
    const res = (await scopedApi.get(`plugin/form/${encodeURIComponent(payload.pluginId)}`, {
      feedback: 'silent',
    })) as { model?: Record<string, unknown>; data?: { model?: Record<string, unknown> } } | null
    const model = res?.model ?? res?.data?.model
    initialConfigModel.value = model && typeof model === 'object' ? model : {}
  } catch {
    initialConfigModel.value = {}
  }
}

async function mountSurface(payload: PluginMountPayload, surface: PluginShellSurface): Promise<void> {
  const generation = ++mountGeneration
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const remoteId = payload.pluginId
  activeComponent.value = null
  inlineDialogs.value = []
  domHeaderButtons.value = new Map()
  clearRegisteredCommands()

  currentMount.value = payload
  activeSurface.value = surface
  runtimeState.value = {
    pluginId: payload.pluginId,
    sourcePluginId: payload.sourcePluginId,
    surface,
    locale: payload.locale || runtimeState.value.locale,
    theme: payload.visualTokens?.mode || runtimeState.value.theme,
    user: payload.user || runtimeState.value.user,
  }

  writeSanitizedUserSnapshot(payload)
  if (payload.visualTokens) {
    applyNativeVisualTokens(theme, payload.visualTokens)
  }
  if (payload.safeArea) {
    applySafeAreaInsets(payload.safeArea)
  }
  if (payload.locale && typeof document !== 'undefined') {
    document.documentElement.lang = payload.locale
  }
  notifyEnvironmentChanged()

  const remoteUrl = payload.remoteEntryUrl
  if (!remoteUrl) {
    pluginHostBridge.send('plugin.error', {
      mountId: payload.mountId,
      stage: 'register',
      message: '缺少远程插件入口地址',
      recoverable: true,
    })
    return
  }

  try {
    setFederationRemote(remoteId, {
      format: 'esm',
      from: 'vite',
      url: () => Promise.resolve(remoteUrl),
    })
  } catch (error) {
    pluginHostBridge.send('plugin.error', {
      mountId: payload.mountId,
      stage: 'register',
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    })
    return
  }

  const candidates = candidateExposesFor(surface, payload.navKey)
  let loadedModule: unknown = null
  let lastError: unknown = null

  for (const expose of candidates) {
    try {
      loadedModule = await getFederationRemote(remoteId, expose)
      if (loadedModule) break
    } catch (error) {
      lastError = error
    }
  }

  if (generation !== mountGeneration) return

  if (!loadedModule) {
    pluginHostBridge.send('plugin.error', {
      mountId: payload.mountId,
      stage: 'load',
      message: lastError instanceof Error ? lastError.message : `无法加载联邦插件组件 (${candidates.join(', ')})`,
      recoverable: true,
    })
    return
  }

  await loadInitialConfigIfNeeded(payload)
  if (generation !== mountGeneration) return

  const resolved = unwrapFederationDefault(loadedModule)
  mountSessionId.value = `${payload.mountId}:${surface}:${generation}`
  activeComponent.value = markRaw(resolved)

  await nextTick()
  const notifyFrame = () => {
    if (generation !== mountGeneration) return
    cleanOpaquePluginRoots(mountStageRef.value)
    extractFallbackDomHeader()
    const elapsed = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)
    pluginHostBridge.send('plugin.mounted', {
      mountId: payload.mountId,
      title: payload.pluginName || payload.pluginId,
      durationMs: Math.max(0, elapsed),
    })
  }
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => notifyFrame())
  } else {
    notifyFrame()
  }
}

function handleUnmount(mountId?: string): void {
  if (mountId && currentMount.value && currentMount.value.mountId !== mountId) return
  mountGeneration += 1
  pluginHostBridge.abortAllPending('Plugin unmounted')
  activeComponent.value = null
  currentMount.value = null
  inlineDialogs.value = []
  domHeaderButtons.value = new Map()
  initialConfigModel.value = {}
  clearRegisteredCommands()
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: 0, left: 0 })
  }
}

function handleNavBack(mountId?: string): void {
  if (inlineDialogs.value.length > 0) {
    inlineDialogs.value = inlineDialogs.value.slice(0, -1)
    pluginHostBridge.send('nav.backResult', { mountId: mountId || currentMount.value?.mountId || '', handled: true })
    return
  }
  if (typeof document !== 'undefined') {
    const activeOverlay = document.querySelector('.v-overlay--active')
    if (activeOverlay) {
      const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      document.dispatchEvent(escEvent)
      pluginHostBridge.send('nav.backResult', { mountId: mountId || currentMount.value?.mountId || '', handled: true })
      return
    }
  }
  pluginHostBridge.send('nav.backResult', { mountId: mountId || currentMount.value?.mountId || '', handled: false })
}

function handleHostAction(actionId: string): void {
  const sdkCmd = sdkHeaderCommands.value.find(item => item.id === actionId)
  if (sdkCmd) {
    sdkCmd.invoke()
    return
  }
  const domBtn = domHeaderButtons.value.get(actionId)
  if (domBtn) {
    domBtn.click()
  }
}

async function handleConfigSave(newConfig: Record<string, unknown>): Promise<void> {
  const mount = currentMount.value
  if (!mount) return
  initialConfigModel.value = newConfig
  try {
    await scopedApi.put(`plugin/${encodeURIComponent(mount.pluginId)}`, newConfig, { feedback: 'silent' })
    toast.success(`${mount.pluginName || mount.pluginId} 配置已保存`)
    pluginHostBridge.haptic('success')
    pluginHostBridge.send('plugin.action', {
      mountId: mount.mountId,
      payload: { type: 'save', pluginId: mount.pluginId },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    toast.error(`保存失败：${message}`)
    pluginHostBridge.haptic('error')
  }
}

function handleSwitchSurface(): void {
  const mount = currentMount.value
  if (!mount) return
  const nextSurface: PluginShellSurface = activeSurface.value === 'config' ? 'dataPage' : 'config'
  void mountSurface(mount, nextSurface)
  pluginHostBridge.send('plugin.action', {
    mountId: mount.mountId,
    payload: { type: 'switch', surface: nextSurface },
  })
}

function handleComponentClose(): void {
  const mount = currentMount.value
  pluginHostBridge.send('plugin.close', { mountId: mount?.mountId || '' })
}

function handleComponentAction(payload?: unknown): void {
  const mount = currentMount.value
  pluginHostBridge.send('plugin.action', {
    mountId: mount?.mountId || '',
    payload: payload ?? {},
  })
}

function closeInlineDialog(id: number): void {
  inlineDialogs.value = inlineDialogs.value.filter(entry => entry.id !== id)
}

function bindInlineDialogEvents(entry: InlineSharedDialogEntry): Record<string, (...args: unknown[]) => unknown> {
  const listeners: Record<string, (...args: unknown[]) => unknown> = {}
  const closeEvents = entry.closeOn === false ? [] : entry.closeOn
  const eventNames = new Set([...Object.keys(entry.events), ...closeEvents])
  for (const name of eventNames) {
    listeners[name] = (...args: unknown[]) => {
      const fn = entry.events[name]
      const res = fn ? fn(...args) : undefined
      if (closeEvents.includes(name)) {
        closeInlineDialog(entry.id)
      }
      return res
    }
  }
  return listeners
}

const surfaceProps = computed(() => {
  const mount = currentMount.value
  const extra = mount?.props && typeof mount.props === 'object' ? mount.props : {}
  const base: Record<string, unknown> = {
    ...extra,
    api: scopedApi,
    hostSdk,
    nativeSubscribe,
    subscriptionManager,
    pluginId: mount?.pluginId || '',
    sourcePluginId: mount?.sourcePluginId,
  }
  if (activeSurface.value === 'config') {
    base.initialConfig = initialConfigModel.value
  } else if (activeSurface.value === 'dataPage') {
    base.show_switch = mount?.showSwitch !== false
  } else if (activeSurface.value === 'appPage') {
    base.navKey = mount?.navKey || 'main'
  }
  return base
})

const unsubscribeHost = pluginHostBridge.onHostMessage((envelope: HostToWebEnvelope) => {
  const payload = envelope.payload || {}
  switch (envelope.type) {
    case 'plugin.mount': {
      const mountPayload = payload as unknown as PluginMountPayload
      void mountSurface(mountPayload, mountPayload.surface || 'dataPage')
      break
    }
    case 'plugin.unmount':
      handleUnmount(typeof payload.mountId === 'string' ? payload.mountId : undefined)
      break
    case 'theme.update': {
      const tokens = (payload.visualTokens || payload) as unknown as NativeVisualTokens
      if (tokens && typeof tokens === 'object' && 'mode' in tokens) {
        applyNativeVisualTokens(theme, tokens)
        runtimeState.value = {
          ...runtimeState.value,
          theme: tokens.mode === 'light' ? 'light' : 'dark',
        }
        notifyEnvironmentChanged()
      }
      break
    }
    case 'locale.update':
      if (typeof payload.locale === 'string' && payload.locale) {
        runtimeState.value = { ...runtimeState.value, locale: payload.locale }
        if (typeof document !== 'undefined') {
          document.documentElement.lang = payload.locale
        }
        notifyEnvironmentChanged()
      }
      break
    case 'safeArea.update':
      applySafeAreaInsets(payload as unknown as SafeAreaInsets)
      break
    case 'nav.back':
      handleNavBack(typeof payload.mountId === 'string' ? payload.mountId : undefined)
      break
    case 'host.action':
      if (typeof payload.actionId === 'string') {
        handleHostAction(payload.actionId)
      }
      break
    default:
      break
  }
})

onErrorCaptured(error => {
  const mount = currentMount.value
  pluginHostBridge.send('plugin.error', {
    mountId: mount?.mountId || '',
    stage: 'render',
    message: error instanceof Error ? error.message : String(error),
    recoverable: true,
  })
  return false
})

onMounted(() => {
  pluginHostBridge.attachGlobalReceiver()
  applyNativeVisualTokens(theme, getDefaultVisualTokens())
  if (typeof window !== 'undefined') {
    window.__mpPluginShellReady = true
  }
  pluginHostBridge.send('shell.ready', {
    shellVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.replace(/^v/, '') : '3.0.0',
    vuetifyVersion: '3.7.3',
  })
})

onBeforeUnmount(() => {
  unsubscribeHost()
  pluginHostBridge.abortAllPending('Shell disposed')
})
</script>

<template>
  <VApp class="mp-shell-app">
    <VMain class="mp-shell-main">
      <div ref="mountStageRef" class="mp-shell-root">
        <div v-if="activeComponent" class="mp-shell-mount-stage">
          <component
            :is="activeComponent"
            :key="mountSessionId"
            v-bind="surfaceProps"
            @close="handleComponentClose"
            @action="handleComponentAction"
            @save="handleConfigSave"
            @switch="handleSwitchSurface"
          />
        </div>
      </div>

      <!-- 轻量宿主公共弹窗栈（支持 hostSdk.ui.dialog） -->
      <VDialog
        v-for="entry in inlineDialogs"
        :key="entry.id"
        :model-value="true"
        scrollable
        max-width="560"
        @update:model-value="val => !val && closeInlineDialog(entry.id)"
      >
        <component :is="entry.component" v-bind="entry.props" v-on="bindInlineDialogEvents(entry)" />
      </VDialog>
    </VMain>
  </VApp>
</template>
