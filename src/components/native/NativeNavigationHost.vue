<script setup lang="ts">
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
import { nativeGlobalActions, nativeHeaderRegistration } from '@/native/registry'
import { NativeChromeSession } from '@/native/session'
import { NativeLayoutAdapter, nativeChromeActive } from '@/native/layout'
import { NativeRouteHistory } from '@/native/history'
import type { NativeAction, NativeEnvelope, NativeSnapshot } from '@/native/protocol'
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
        { id: '/apps', path: '/apps', title: t('nav.more'), icon: 'apps' },
      ]
    : [],
)
const history = new NativeRouteHistory(router, () => roots.value)
const layout = new NativeLayoutAdapter(document, window)
let bridge: NativeChromeSession | undefined
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

/** 标题优先使用原菜单定义，详情等无目录页面保留已本地化的文档标题。 */
function pageTitle() {
  const menu = [...menus.value]
    .sort((a, b) => String(b.to).length - String(a.to).length)
    .find(item => typeof item.to === 'string' && (route.path === item.to || route.path.startsWith(`${item.to}/`)))
  return menu?.full_title || menu?.title || (route.path === '/apps' ? t('nav.more') : document.title || 'MoviePilot')
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

/** 从当前注册和当前权限重新生成声明及 JS 回调表，旧对象不作为执行依据。 */
const model = computed(() => {
  const revision = history.revision.value
  const actions: NativeAction[] = []
  const callbacks = new Map<string, () => void>()
  const header = nativeHeaderRegistration.value
  let headerTabs: NativeSnapshot['headerTabs']
  if (authenticated.value && header && header.routePath === route.path) {
    const ownerId = ownerFor(header, header.ownerId)
    const items = filterItemsByPermission(header.items, permissions.value)
    if (items.length) {
      if (!header.onUpdateModelValue || !items.some(item => item.tab === header.modelValue))
        throw new Error('unsupported_header_registration')
      headerTabs = {
        ownerId,
        selectedId: header.modelValue,
        items: items.map(item => ({ id: item.tab, title: item.title })),
      }
    }
    for (const [index, button] of (header.appendButtons ?? []).entries()) {
      if (toValue(button.show) === false || !hasItemPermission(button, permissions.value)) continue
      if (!button.action) throw new Error('unsupported_header_action')
      const actionId = `r${revision}:header:${index}`
      const loading = Boolean(toValue(button.loading))
      actions.push({
        actionId,
        ownerId,
        title: button.title || `${pageTitle()} · ${t('nav.more')}`,
        icon: button.icon,
        position: 'trailing',
        enabled: !loading,
        loading,
        ...(button.dataAttr ? { dataAttr: button.dataAttr } : {}),
      })
      callbacks.set(actionId, button.action)
    }
  }
  if (authenticated.value) {
    for (const action of nativeGlobalActions.value.values()) {
      if (action.visible !== undefined && !toValue(action.visible)) continue
      const actionId = `r${revision}:global:${action.id}`
      actions.push({
        actionId,
        ownerId: ownerFor(action),
        title: toValue(action.title),
        icon: action.icon,
        position: 'trailing',
        enabled: true,
        loading: false,
        ...(action.dataAttr ? { dataAttr: action.dataAttr } : {}),
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
        title: button.title || `${pageTitle()} · ${t('nav.more')}`,
        icon: button.icon,
        position: 'accessory',
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
    presentation: { overlayOpen: overlayOpen.value },
    ...(headerTabs ? { headerTabs } : {}),
    chrome: {
      topVisible: Boolean(route.meta.requiresAuth),
      bottomVisible: authenticated.value,
      theme: theme.global.current.value.dark ? 'dark' : 'light',
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
  return { routeRevision: revision, snapshot, callbacks }
})

/** 分派时重新读取 model，复核 owner、路由、权限、loading 及可见性。 */
function execute(message: NativeEnvelope) {
  const current = model.value
  const payload = message.payload
  if (message.type === 'navigation.selectRoot')
    return !overlayOpen.value && typeof payload.rootId === 'string' && history.selectRoot(payload.rootId)
  if (message.type === 'navigation.back') return history.back(document, window)
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
    nativeHeaderRegistration.value?.onUpdateModelValue?.(payload.tabId as string)
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
  if (!action || !action.enabled || action.loading || !callback) return false
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
        (record.target instanceof Element && record.target.classList.contains('v-overlay')),
    )
  )
    return
  overlayScheduled = true
  queueMicrotask(() => {
    overlayScheduled = false
    overlayOpen.value = Boolean(document.querySelector('.v-overlay--active.v-dialog, .v-overlay--active.v-menu'))
  })
})
overlayObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
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
        if (!active) appActivityLifecycle.setHostLifecycle(undefined)
        await nextTick()
        if (active)
          layout.syncAnchors(model.value.snapshot.actions.flatMap(action => (action.dataAttr ? [action.dataAttr] : [])))
      },
      lifecycle: state => appActivityLifecycle.setHostLifecycle(state),
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
    bridge?.identityChanged()
  },
  { flush: 'sync' },
)
void router.isReady().then(() => {
  routerReady.value = true
})
onScopeDispose(() => {
  overlayObserver.disconnect()
  history.stop()
  void bridge?.stop()
  layout.setActive(false)
})
</script>

<template><span hidden aria-hidden="true" data-native-navigation-host /></template>
