<script setup lang="ts">
import { glassAppearancePreference } from '@/utils/themePalette'
import { computed, nextTick, onScopeDispose, ref, toValue, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'
import { useAuthStore, useUserStore, usePluginSidebarNavStore } from '@/stores'
import { getNavMenus } from '@/router/i18n-menu'
import {
  buildUserPermissionContext,
  filterItemsByPermission,
  filterMenusByPermission,
  hasItemPermission,
} from '@/utils/permission'
import { isMediaSourceCatalogLoaded } from '@/utils/mediaId'
import { isModuleCatalogLoaded } from '@/composables/useModuleCatalog'
import { dynamicButtonRegistry } from '@/composables/dynamicButtonRegistry'
import { buildFooterMenus } from '@/utils/footerNavigation'
import { groupAppMenus } from '@/utils/appNavigation'
import { filterPluginSidebarNavEntries } from '@/utils/pluginSidebarNav'
import { nativeGlobalActions, nativeHeaderRegistration, nativeRequestedPanel } from '@/native/registry'
import { dispatchNativePanel, projectNativePanel } from '@/native/panel'
import { readNativePresentation } from '@/native/presentation'
import { NativeSheetAdapter } from '@/native/sheet'
import { NativeConfirmationAdapter } from '@/native/confirmation'
import { NativeChromeSession } from '@/native/session'
import { NativeWidgetAdapter, navigateNativeWidget } from '@/native/widgets'
import api from '@/api'
import { NativeLayoutAdapter, nativeChromeActive } from '@/native/layout'
import { NativeRouteHistory } from '@/native/history'
import { NativeHeaderTabs } from '@/native/header'
import { nativePageHeaders } from '@/native/page'
import type { DynamicHeaderTabButton } from '@/composables/useDynamicHeaderTab'
import type { NativeAction, NativeConfirmation, NativeEnvelope, NativeSheet, NativeSnapshot } from '@/native/protocol'
import { isNativeRoute } from '@/native/protocol'
import { appActivityLifecycle } from '@/utils/appActivityLifecycle'
import '@/native/native.scss'

const route = useRoute()
const router = useRouter()
const { t, te } = useI18n()
const theme = useTheme()
const auth = useAuthStore()
const user = useUserStore()
const pluginMenus = usePluginSidebarNavStore()
const routerReady = ref(false)
const overlayOpen = ref(false)
const fullscreenOverlay = ref(false)
const activePanel = ref<string>()
const sheet = ref<NativeSheet>()
const confirmation = ref<NativeConfirmation>()
const permissions = computed(() => buildUserPermissionContext(user.superUser, user.permissions))
const menus = computed(() => filterMenusByPermission(getNavMenus(t), permissions.value))
const authenticated = computed(() => Boolean(auth.token) && user.userID >= 0 && Boolean(route.meta.requiresAuth))
const roots = computed<NativeSnapshot['roots']>(() =>
  authenticated.value
    ? [
        ...buildFooterMenus(menus.value)
          .filter(menu => typeof menu.to === 'string' && menu.to !== '/apps')
          .map(menu => ({
            id: menu.to as string,
            path: menu.to as string,
            title: menu.title,
            icon: typeof menu.icon === 'string' ? menu.icon : 'apps',
          })),
        { id: '/apps', path: '/apps', title: t('nav.more'), icon: 'more' },
      ]
    : [],
)
const history = new NativeRouteHistory(router, () => roots.value)
// Vue 完成守卫和异步页面解析后、修改实际内容前保留离页画面，不改变任何业务历史。
const removePreviewHook = router.beforeResolve(async (to, from) => {
  if (to.fullPath !== from.fullPath) await bridge?.prepareNavigation()
})
const layout = new NativeLayoutAdapter(document, window)
const sheetAdapter = new NativeSheetAdapter(document)
const confirmationAdapter = new NativeConfirmationAdapter(document)
const headerProjection = new NativeHeaderTabs()
let bridge: NativeChromeSession | undefined
const widgetAdapter =
  window.MoviePilotNative?.widgetsVersion === 1
    ? new NativeWidgetAdapter({
        api,
        apiBase: new URL(import.meta.env.VITE_API_BASE_URL, document.baseURI),
        origin: location.origin,
        isActive: () => nativeChromeActive.value && authenticated.value,
        readToken: () => auth.token,
        canNavigate: () => !overlayOpen.value,
        navigate: path => navigateNativeWidget(router, path),
      })
    : undefined
let ownerSequence = 0
const legacyOwners = new WeakMap<object, string>()

/** 兼容未携带 owner 的旧注册，为每个实际注册对象分配有限生命周期标识。 */
function ownerFor(object: object, explicit?: string | null) {
  if (explicit) return explicit
  let owner = legacyOwners.get(object)
  if (!owner) {
    owner = `legacy-${++ownerSequence}`
    legacyOwners.set(object, owner)
  }
  return owner
}

/** 菜单页使用原目录标题；详情沿用业务路由携带的标题，不改变主入口名称。 */
function pageTitle() {
  const menu = [...menus.value]
    .sort((a, b) => String(b.to).length - String(a.to).length)
    .find(item => typeof item.to === 'string' && (route.path === item.to || route.path.startsWith(`${item.to}/`)))
  if (menu?.to === route.path) return menu.full_title || menu.title
  const pageHeader = [...nativePageHeaders.value.values()]
    .filter(header => header.routePath === route.path)
    .map(header => toValue(header.title))
    .reverse()
    .find(title => Boolean(title))
  const detailTitle = typeof route.query.title === 'string' ? route.query.title : undefined
  return (
    pageHeader ||
    detailTitle ||
    menu?.full_title ||
    menu?.title ||
    (route.path === '/apps' ? t('nav.more') : document.title || 'MoviePilot')
  )
}

/** 菜单标题与网页 Dock 使用相同旧键兼容，未声明文案时采用当前页的更多操作。 */
function menuTitle(item: { titleKey?: string; title?: string; titleParams?: Record<string, unknown> }) {
  const aliases: Record<string, string> = {
    'components.subscribeHistory.title': 'dialog.subscribeHistory.title',
    'components.subscribeEdit.titleDefault': 'dialog.subscribeEdit.titleDefault',
    'components.transferQueue.title': 'dialog.transferQueue.title',
    'components.pluginMarketSetting.title': 'dialog.pluginMarketSetting.title',
  }
  const key = item.titleKey ?? aliases[item.title ?? ''] ?? item.title
  return key ? (item.titleKey || te(key) ? t(key, item.titleParams ?? {}) : key) : `${pageTitle()} · ${t('nav.more')}`
}

/** 旧注册的图标按钮补充可读操作名，避免原生菜单与 VoiceOver 出现多个同名更多按钮。 */
function actionTitle(button: { title?: string; icon: string }) {
  if (button.title) return button.title
  const keys: Record<string, string> = {
    'mdi-filter-multiple-outline': 'common.filter',
    'mdi-sort-variant': 'file.sort',
    'mdi-refresh': 'common.refresh',
    'mdi-plus': 'common.add',
  }
  return keys[button.icon] ? t(keys[button.icon]) : `${pageTitle()} · ${t('nav.more')}`
}

/** 从当前注册和当前权限重新生成声明及 JS 回调表，旧对象不作为执行依据。 */
const model = computed(() => {
  const revision = history.revision.value
  const actions: NativeAction[] = []
  const callbacks = new Map<string, () => void>()
  const panels = new Map<string, ReturnType<typeof projectNativePanel>>()
  const header = nativeHeaderRegistration.value
  let headerTabs: NativeSnapshot['headerTabs']
  /** 共用标题栏与页内标题旁动作的权限、禁用和回调规则，执行时再次读取当前声明。 */
  function appendHeaderActions(buttons: DynamicHeaderTabButton[], ownerId: string, source: string) {
    for (const [index, button] of buttons.entries()) {
      if (toValue(button.show) === false || !hasItemPermission(button, permissions.value)) continue
      if (!button.action) throw new Error('unsupported_header_action')
      const actionId = `r${revision}:${source}:${index}`
      const loading = Boolean(toValue(button.loading))
      const panel = button.panel?.()
      const projection = panel
        ? projectNativePanel(
            activePanel.value === actionId
              ? panel
              : {
                  ...panel,
                  sections: [],
                  feed: undefined,
                  retainedItems: undefined,
                  loadError: undefined,
                  hasMore: false,
                },
          )
        : undefined
      if (projection) panels.set(actionId, projection)
      actions.push({
        actionId,
        ownerId,
        title: actionTitle(button),
        icon: button.icon,
        position: 'trailing',
        scope: 'page',
        enabled: !loading && !toValue(button.disabled),
        loading,
        ...(projection ? { panel: projection.panel } : {}),
        ...(button.dataAttr ? { dataAttr: button.dataAttr } : {}),
      })
      callbacks.set(actionId, button.action)
    }
  }
  if (authenticated.value && header && header.routePath === route.path) {
    const ownerId = ownerFor(header, header.ownerId)
    const items = filterItemsByPermission(header.items, permissions.value)
    if (items.length) {
      if (!header.onUpdateModelValue) throw new Error('unsupported_header_registration')
      headerTabs = headerProjection.project(ownerId, items, header.modelValue)
    }
    appendHeaderActions(header.appendButtons ?? [], ownerId, 'header')
  }
  if (authenticated.value) {
    for (const page of nativePageHeaders.value.values()) {
      if (page.routePath === route.path) appendHeaderActions(toValue(page.actions) ?? [], page.ownerId, page.ownerId)
    }
    for (const action of nativeGlobalActions.value.values()) {
      if (action.visible !== undefined && !toValue(action.visible)) continue
      const actionId = `r${revision}:global:${action.id}`
      const source = action.panel?.()
      const projection = source
        ? projectNativePanel(
            activePanel.value === actionId
              ? source
              : {
                  ...source,
                  sections: [],
                  feed: undefined,
                  retainedItems: undefined,
                  loadError: undefined,
                  hasMore: false,
                },
          )
        : undefined
      if (projection) panels.set(actionId, projection)
      actions.push({
        actionId,
        ownerId: ownerFor(action),
        title: toValue(action.title),
        icon: action.icon,
        position: 'trailing',
        scope: 'global',
        enabled: true,
        loading: false,
        ...(action.dataAttr ? { dataAttr: action.dataAttr } : {}),
        ...(projection ? { panel: projection.panel } : {}),
      })
      callbacks.set(actionId, action.invoke)
    }
    const registration = dynamicButtonRegistry.registration.value
    const button = registration?.button
    if (
      route.path !== '/apps' &&
      registration &&
      button?.show &&
      (!button.routePath || button.routePath === route.path) &&
      hasItemPermission(button, permissions.value)
    ) {
      const ownerId = ownerFor(registration, registration.ownerId)
      const actionId = `r${revision}:accessory`
      const items = filterItemsByPermission(button.menuItems ?? [], permissions.value)
      const menu = items.map((item, index) => {
        const id = `${actionId}:menu:${index}`
        if (!item.disabled) callbacks.set(id, item.action)
        return { actionId: id, title: menuTitle(item), icon: item.icon || 'apps', enabled: !item.disabled }
      })
      actions.push({
        actionId,
        ownerId,
        title: actionTitle(button),
        icon: button.icon,
        position: 'accessory',
        scope: 'page',
        enabled: true,
        loading: false,
        ...(menu.length ? { menu } : {}),
      })
      if (!menu.length) callbacks.set(actionId, button.action)
    }
  }
  let menuSequence = 0
  const moreMenu = authenticated.value
    ? Object.entries(
        groupAppMenus(
          menus.value,
          filterPluginSidebarNavEntries(pluginMenus.items, t, permissions.value).map(entry => entry.navMenu),
          t('appcenter.others'),
        ),
      ).map(([title, items], section) => ({
        id: `section-${section}`,
        title,
        items: items.map(item => ({
          id: `menu-${++menuSequence}`,
          path: router.resolve(item.to || '/apps').fullPath,
          title: item.full_title || item.title,
          icon: typeof item.icon === 'string' ? item.icon : 'apps',
          ...(item.description ? { subtitle: item.description } : {}),
        })),
      }))
    : []
  const navigation = history.navigation
  const snapshot: NativeSnapshot = {
    route: {
      fullPath: route.fullPath,
      ...navigation,
      title: pageTitle(),
      ...(overlayOpen.value ? { canGoBack: true, backTarget: navigation.backTarget || route.fullPath } : {}),
    },
    roots: roots.value,
    actions,
    moreMenu,
    presentation: {
      overlayOpen: overlayOpen.value,
      fullscreen: fullscreenOverlay.value,
      ...(sheet.value ? { sheet: sheet.value } : {}),
      ...(confirmation.value ? { confirmation: confirmation.value } : {}),
      ...(nativeRequestedPanel.value ? { requestedPanel: nativeRequestedPanel.value } : {}),
    },
    ...(headerTabs ? { headerTabs } : {}),
    chrome: {
      topVisible: Boolean(route.meta.requiresAuth),
      bottomVisible: authenticated.value,
      theme: glassAppearancePreference.value === 'auto' ? 'system' : glassAppearancePreference.value,
      backgroundColor: theme.global.current.value.colors.background,
      surfaceColor: theme.global.current.value.colors.surface,
      ...(/^#[0-9a-f]{6}$/i.test(theme.global.current.value.colors.primary)
        ? { accentColor: theme.global.current.value.colors.primary }
        : {}),
      content: route.path === '/apps' && authenticated.value ? 'menu' : 'web',
    },
  }
  if (overlayOpen.value) for (const action of actions) action.enabled = false
  if (
    actions.length > 16 ||
    actions.some(action => (action.menu?.length ?? 0) > 32) ||
    moreMenu.length > 32 ||
    menuSequence > 128
  )
    throw new Error('unsupported_action_count')
  return { routeRevision: revision, snapshot, callbacks, panels }
})

/** 分派时重新读取 model，复核 owner、路由、权限、loading 及可见性。 */
async function execute(message: NativeEnvelope) {
  const current = model.value
  const payload = message.payload
  if (message.type === 'confirmation.respond') {
    if (window.MoviePilotNative?.confirmationsVersion !== 1) return false
    const accepted = confirmationAdapter.respond(payload)
    confirmation.value = confirmationAdapter.read()
    return accepted
  }
  if (message.type.startsWith('presentation.')) {
    if (window.MoviePilotNative?.sheetsVersion !== 1) return false
    sheetAdapter.read(pageTitle())
    return sheetAdapter.executeWhenPainted(message.type, payload).then(accepted => {
      if (accepted) sheet.value = sheetAdapter.read(pageTitle())
      return accepted
    })
  }
  if (message.type === 'navigation.selectRoot')
    return !overlayOpen.value && typeof payload.rootId === 'string' && history.selectRoot(payload.rootId)
  if (message.type === 'navigation.back') return history.back(document, window)
  if (message.type === 'navigation.waitForPaint') {
    await nextTick()
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return true
  }
  if (message.type === 'notification.open') {
    if (!authenticated.value || overlayOpen.value || !isNativeRoute(payload.path)) return false
    if (payload.path === '/?shotcut=message') {
      const action = nativeGlobalActions.value.get('notifications')
      if (!action || (action.visible !== undefined && !toValue(action.visible))) return false
      if (action.panel && window.MoviePilotNative?.panelsVersion === 1) nativeRequestedPanel.value = action.id
      else action.invoke()
    } else {
      void router.push(payload.path).catch(() => {
        /* 业务守卫保留目的页的权限判断，失败不重放通知动作。 */
      })
    }
    return true
  }
  if (message.type === 'navigation.open') {
    if (overlayOpen.value) return false
    const item = current.snapshot.moreMenu
      ?.flatMap(section => section.items)
      .find(item => item.id === payload.itemId && item.path === payload.path)
    if (!item || route.path !== '/apps') return false
    void router.push(item.path).catch(() => {
      /* 守卫取消保持当前菜单，不重放导航。 */
    })
    return true
  }
  if (message.type === 'headerTab.select') {
    if (overlayOpen.value) return false
    const tabs = current.snapshot.headerTabs
    if (!tabs || payload.ownerId !== tabs.ownerId || !tabs.items.some(item => item.id === payload.tabId)) return false
    const value = headerProjection.resolve(tabs.ownerId, payload.tabId as string)
    if (value === undefined) return false
    nativeHeaderRegistration.value?.onUpdateModelValue?.(value)
    return true
  }
  if (message.type !== 'action.invoke' || typeof payload.actionId !== 'string') return false
  const action = current.snapshot.actions.find(
    item =>
      item.ownerId === payload.ownerId &&
      (item.actionId === payload.actionId ||
        item.menu?.some(child => child.actionId === payload.actionId && child.enabled)),
  )
  const callback = current.callbacks.get(payload.actionId)
  if (!action || !action.enabled || action.loading) return false
  if (payload.panelEvent !== undefined) {
    const panel = current.panels.get(action.actionId)
    if (!panel) return false
    if (payload.panelEvent === 'close') {
      if (activePanel.value === action.actionId) activePanel.value = undefined
      return true
    }
    if (payload.panelEvent === 'open') {
      activePanel.value = action.actionId
      nativeRequestedPanel.value = undefined
    } else if (activePanel.value !== action.actionId) return false
    const accepted = dispatchNativePanel(model.value.panels.get(action.actionId)!, payload)
    if (accepted && payload.panelEvent === 'select' && !panel.callbacks.get(String(payload.itemId))?.keepOpen)
      activePanel.value = undefined
    return accepted
  }
  if (!callback) return false
  if (action.dataAttr) layout.positionAnchor(action.dataAttr, payload.framePoints, payload.layoutRevision)
  callback()
  return true
}

const canStart = computed(
  () => routerReady.value && authenticated.value && isMediaSourceCatalogLoaded().value && isModuleCatalogLoaded().value,
)
watch([routerReady, () => route.path], ([ready, path]) => {
  if (ready && path === '/login') window.MoviePilotNative?.authenticationRequired?.()
})

let overlayScheduled = false
const overlayObserver = new MutationObserver(records => {
  if (
    overlayScheduled ||
    !records.some(
      record =>
        record.type === 'childList' ||
        (record.target instanceof Element &&
          Boolean(record.target.closest('.v-overlay, .theme-customizer-panel-host, .agent-assistant-panel'))),
    )
  )
    return
  overlayScheduled = true
  queueMicrotask(() => {
    overlayScheduled = false
    const presentation = readNativePresentation(document)
    overlayOpen.value = presentation.overlayOpen
    fullscreenOverlay.value = presentation.fullscreen
    const nextConfirmation = confirmationAdapter.read()
    if (JSON.stringify(nextConfirmation) !== JSON.stringify(confirmation.value)) confirmation.value = nextConfirmation
    const nextSheet = window.MoviePilotNative?.sheetsVersion === 1 ? sheetAdapter.read(pageTitle()) : undefined
    // 弹窗内动画或正文更新不重发相同的栏位声明，保留系统交互和键盘的稳定性。
    if (JSON.stringify(nextSheet) !== JSON.stringify(sheet.value)) sheet.value = nextSheet
  })
})
overlayObserver.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'disabled', 'aria-label'],
})
watch(
  canStart,
  ready => {
    const transport = window.MoviePilotNative
    if (!ready || bridge || transport?.transportVersion !== 1) return
    bridge = new NativeChromeSession({
      target: window,
      transport,
      readState: () => ({ routeRevision: model.value.routeRevision, snapshot: model.value.snapshot }),
      applyLayout: payload => layout.apply(payload),
      execute,
      setActive: async active => {
        layout.setActive(active)
        confirmationAdapter.setActive(active && transport.confirmationsVersion === 1)
        confirmation.value = confirmationAdapter.read()
        sheetAdapter.setActive(active && transport.sheetsVersion === 1)
        if (!active) {
          appActivityLifecycle.setHostLifecycle(undefined)
          activePanel.value = undefined
          const requested = nativeRequestedPanel.value
          nativeRequestedPanel.value = undefined
          if (requested) nativeGlobalActions.value.get(requested)?.invoke()
        }
        await nextTick()
        if (active)
          layout.syncAnchors(model.value.snapshot.actions.flatMap(action => (action.dataAttr ? [action.dataAttr] : [])))
      },
      lifecycle: state => appActivityLifecycle.setHostLifecycle(state),
      ...(widgetAdapter ? { widgetRequest: (payload, signal) => widgetAdapter.request(payload, signal) } : {}),
    })
    bridge.start()
  },
  { immediate: true },
)

watchEffect(
  () => {
    try {
      const value = model.value
      if (nativeChromeActive.value)
        layout.syncAnchors(value.snapshot.actions.flatMap(action => (action.dataAttr ? [action.dataAttr] : [])))
      bridge?.publish()
    } catch {
      bridge?.fallback()
    }
  },
  { flush: 'post' },
)
watch(
  () => JSON.stringify([user.userID, user.superUser, user.permissions, roots.value.map(root => root.id)]),
  () => {
    history.reset()
    activePanel.value = undefined
    nativeRequestedPanel.value = undefined
    bridge?.identityChanged()
  },
  { flush: 'sync' },
)
watch(
  () => history.revision.value,
  () => {
    activePanel.value = undefined
  },
)
void router.isReady().then(() => {
  routerReady.value = true
})
onScopeDispose(() => {
  overlayObserver.disconnect()
  history.stop()
  removePreviewHook()
  void bridge?.stop()
  layout.setActive(false)
  sheetAdapter.setActive(false)
  confirmationAdapter.setActive(false)
})
</script>

<template><span hidden aria-hidden="true" data-native-navigation-host /></template>
