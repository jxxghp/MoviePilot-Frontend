import { inject, onActivated, onDeactivated, watch } from 'vue'
import { isNavigationFailure, useRouter } from 'vue-router'
import { dynamicButtonRegistry, type DynamicButton } from './dynamicButtonRegistry'
import type { DynamicHeaderTabConfig } from './useDynamicHeaderTab'
import type {
  PluginNavigationServices,
  PluginShellCommand,
  PluginShellServices,
  PluginOperationResult,
} from '@/sdk/plugin'
import type { PluginSDKScope } from './usePluginSDKScope'

/** 只暴露内部导航和当前侧栏页面拥有的命令，不把路由器与注册表交给插件。 */
export function usePluginShellServices(scope: PluginSDKScope, pageShell: boolean) {
  const router = useRouter()
  const registerHeader = inject<((config: DynamicHeaderTabConfig) => void) | null>('registerDynamicHeaderTab', null)
  const unregisterHeader = inject<((path?: string, owner?: string) => void) | null>('unregisterDynamicHeaderTab', null)
  async function navigate(
    target: Parameters<PluginNavigationServices['push']>[0],
    replace: boolean,
  ): Promise<PluginOperationResult> {
    try {
      scope.capture()()
      if (
        !target ||
        typeof target.path !== 'string' ||
        !target.path.startsWith('/') ||
        target.path.startsWith('//') ||
        /[\\?#]/.test(target.path)
      )
        scope.fail('INVALID_REQUEST')
      const location = {
        ...target,
        query: target.query
          ? Object.fromEntries(
              Object.entries(target.query).map(([key, value]) => [
                key,
                typeof value === 'boolean' ? String(value) : value,
              ]),
            )
          : undefined,
      }
      const resolved = router.resolve(location)
      if (!resolved.matched.length || resolved.matched.some(record => record.path.includes(':pathMatch')))
        scope.fail('INVALID_REQUEST')
      const failure = await (replace ? router.replace(location) : router.push(location))
      if (isNavigationFailure(failure)) return { success: false, code: 'CANCELLED', cancelled: true }
      return { success: true, status: 'completed' }
    } catch (error) {
      const code = (error as { code?: string }).code
      return {
        success: false,
        code: code === 'HOST_DISPOSED' ? code : code === 'INVALID_REQUEST' ? code : 'REQUEST_FAILED',
      }
    }
  }
  const navigation: PluginNavigationServices = {
    push: target => navigate(target, false),
    replace: target => navigate(target, true),
  }
  const shell: Partial<PluginShellServices> = {}
  const registrations = new Set<{ publish(): void; hide(): void }>()
  let active = true
  let currentButton: string | null = null
  let currentTabs: string | null = null
  onDeactivated(() => {
    active = false
    registrations.forEach(item => item.hide())
  })
  onActivated(() => {
    active = true
    registrations.forEach(item => item.publish())
  })
  function command(command: PluginShellCommand, check: () => void, path: string, valid: () => boolean) {
    return {
      ...command,
      action: () => {
        try {
          check()
          if (
            valid() &&
            active &&
            router.currentRoute.value.path === path &&
            !command.disabled &&
            scope.can(command.permission, command.feature)
          )
            command.action()
        } catch {
          /* 过期的宿主命令静默失效。 */
        }
      },
    }
  }
  if (pageShell)
    shell.registerButton = options => {
      const check = scope.capture()
      const path = router.currentRoute.value.path
      const owner = `plugin-sdk:${crypto.randomUUID()}`
      let live = true
      currentButton = owner
      const valid = () => live && currentButton === owner && dynamicButtonRegistry.registration.value?.ownerId === owner
      const button: DynamicButton = {
        ...command(options, check, path, valid),
        show: true,
        routePath: path,
        menuItems: options.menuItems?.map(item => command(item, check, path, valid)),
      }
      const registration = {
        publish: () => {
          if (live && currentButton === owner && active && router.currentRoute.value.path === path)
            dynamicButtonRegistry.register(button, owner)
        },
        hide: () => dynamicButtonRegistry.unregister(owner),
      }
      registrations.add(registration)
      registration.publish()
      const stopWatch = watch(
        () => router.currentRoute.value.path,
        value => {
          if (value !== path) registration.hide()
          else registration.publish()
        },
        { flush: 'sync' },
      )
      return scope.track(() => {
        live = false
        if (currentButton === owner) currentButton = null
        stopWatch()
        registration.hide()
        registrations.delete(registration)
      })
    }
  if (pageShell && registerHeader && unregisterHeader)
    shell.registerTabs = options => {
      const check = scope.capture()
      const path = router.currentRoute.value.path
      const owner = `plugin-sdk:${crypto.randomUUID()}`
      let live = true
      currentTabs = owner
      const valid = () => live && currentTabs === owner
      const items = options.items.map(item => ({ ...item }))
      if (
        !items.length ||
        !items.some(item => item.tab === options.selected) ||
        new Set(items.map(item => item.tab)).size !== items.length
      )
        scope.fail('INVALID_REQUEST')
      const config: DynamicHeaderTabConfig = {
        ownerId: owner,
        routePath: path,
        items,
        modelValue: options.selected,
        onUpdateModelValue: value => {
          try {
            check()
            if (
              valid() &&
              active &&
              router.currentRoute.value.path === path &&
              items.some(item => item.tab === value)
            ) {
              config.modelValue = value
              registration.publish()
              options.onSelect(value)
            }
          } catch {
            /* 旧页回调不能修改新页面。 */
          }
        },
        appendButtons: options.buttons?.map(item => command(item, check, path, valid)),
      }
      const registration = {
        publish: () => {
          if (valid() && active && router.currentRoute.value.path === path) registerHeader(config)
        },
        hide: () => unregisterHeader(path, owner),
      }
      registrations.add(registration)
      registration.publish()
      const stopWatch = watch(
        () => router.currentRoute.value.path,
        value => {
          if (value !== path) registration.hide()
          else registration.publish()
        },
        { flush: 'sync' },
      )
      return {
        update(selected) {
          check()
          if (!valid()) scope.fail('HOST_DISPOSED')
          if (!items.some(item => item.tab === selected)) scope.fail('INVALID_REQUEST')
          config.modelValue = selected
          registration.publish()
        },
        dispose: scope.track(() => {
          live = false
          if (currentTabs === owner) currentTabs = null
          stopWatch()
          registration.hide()
          registrations.delete(registration)
        }),
      }
    }
  return { navigation, shell: Object.keys(shell).length ? shell : undefined }
}
