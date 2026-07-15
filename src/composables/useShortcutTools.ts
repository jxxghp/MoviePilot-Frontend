import type { Component } from 'vue'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useUserStore } from '@/stores'
import {
  buildUserPermissionContext,
  filterItemsByPermission,
  hasItemPermission,
  type PermissionProtectedItem,
} from '@/utils/permission'
import { useI18n } from 'vue-i18n'

const NameTestView = defineAsyncComponent(() => import('@/views/system/NameTestView.vue'))
const NetTestView = defineAsyncComponent(() => import('@/views/system/NetTestView.vue'))
const RuleTestView = defineAsyncComponent(() => import('@/views/system/RuleTestView.vue'))
const ModuleTestView = defineAsyncComponent(() => import('@/views/system/ModuleTestView.vue'))
const WordsView = defineAsyncComponent(() => import('@/views/system/WordsView.vue'))
const CacheView = defineAsyncComponent(() => import('@/views/system/CacheView.vue'))
const AccountSettingService = defineAsyncComponent(() => import('@/views/system/ServiceView.vue'))
const ShortcutLogDialog = defineAsyncComponent(() => import('@/components/dialog/ShortcutLogDialog.vue'))
const ShortcutToolDialog = defineAsyncComponent(() => import('@/components/dialog/ShortcutToolDialog.vue'))

// 定时服务在捷径与仪表板中共用的图标，避免两个入口的视觉语义漂移。
export const SCHEDULER_SHORTCUT_ICON = 'mdi-list-box'

export type ShortcutToolItem = PermissionProtectedItem & {
  bodyClass?: string
  cardClass?: string
  component?: Component
  customDialog?: Component
  dialog: string
  dialogSubtitle?: string
  icon: string
  maxWidth?: string
  subtitle: string
  title: string
  titleText?: string
}

/** 提供顶部捷径与仪表板共用的工具定义和打开逻辑。 */
export function useShortcutTools() {
  const { t } = useI18n()
  const userStore = useUserStore()
  const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))

  const shortcuts: ShortcutToolItem[] = [
    {
      title: t('shortcut.recognition.title'),
      subtitle: t('shortcut.recognition.subtitle'),
      icon: 'mdi-text-recognition',
      dialog: 'nameTest',
      component: NameTestView,
      maxWidth: '65rem',
      titleText: t('shortcut.recognition.title'),
    },
    {
      title: t('shortcut.rule.title'),
      subtitle: t('shortcut.rule.subtitle'),
      icon: 'mdi-filter-cog',
      dialog: 'ruleTest',
      component: RuleTestView,
      maxWidth: '65rem',
      titleText: t('shortcut.rule.subtitle'),
    },
    {
      title: t('shortcut.log.title'),
      subtitle: t('shortcut.log.subtitle'),
      icon: 'mdi-file-document',
      dialog: 'logging',
      customDialog: ShortcutLogDialog,
    },
    {
      title: t('shortcut.network.title'),
      subtitle: t('shortcut.network.subtitle'),
      icon: 'mdi-network',
      dialog: 'netTest',
      component: NetTestView,
      titleText: t('shortcut.network.subtitle'),
    },
    {
      title: t('shortcut.words.title'),
      subtitle: t('shortcut.words.subtitle'),
      icon: 'mdi-file-word-box',
      dialog: 'words',
      bodyClass: 'words-shortcut-dialog-body pa-0',
      cardClass: 'words-shortcut-dialog-card',
      component: WordsView,
      maxWidth: '60rem',
      titleText: t('shortcut.words.subtitle'),
    },
    {
      title: t('shortcut.cache.title'),
      subtitle: t('shortcut.cache.subtitle'),
      icon: 'mdi-database',
      dialog: 'cache',
      bodyClass: 'cache-shortcut-dialog-body',
      cardClass: 'cache-shortcut-dialog-card',
      component: CacheView,
      maxWidth: '90rem',
      titleText: t('shortcut.cache.subtitle'),
    },
    {
      title: t('shortcut.scheduler.title'),
      subtitle: t('shortcut.scheduler.subtitle'),
      icon: SCHEDULER_SHORTCUT_ICON,
      dialog: 'scheduler',
      bodyClass: 'scheduler-shortcut-dialog-body pa-0',
      cardClass: 'scheduler-shortcut-dialog-card',
      component: AccountSettingService,
      maxWidth: '60rem',
      titleText: t('shortcut.scheduler.subtitle'),
      dialogSubtitle: t('setting.scheduler.subtitle'),
    },
    {
      title: t('shortcut.system.title'),
      subtitle: t('shortcut.system.subtitle'),
      icon: 'mdi-cog',
      dialog: 'systemTest',
      bodyClass: 'system-health-dialog-body pa-0',
      cardClass: 'system-health-dialog-card',
      component: ModuleTestView,
      titleText: t('shortcut.system.subtitle'),
    },
  ].map(item => ({ ...item, permission: 'admin' }))

  const visibleShortcuts = computed(() => filterItemsByPermission(shortcuts, userPermissions.value))

  /** 打开工具对应的共享弹窗。 */
  function openShortcutDialog(item: ShortcutToolItem) {
    if (!hasItemPermission(item, userPermissions.value)) return

    if (item.customDialog) {
      openSharedDialog(item.customDialog, {}, {}, { closeOn: ['close', 'update:modelValue'] })
      return
    }

    if (!item.component) return

    openSharedDialog(
      ShortcutToolDialog,
      {
        bodyClass: item.bodyClass,
        cardClass: item.cardClass,
        icon: item.icon,
        maxWidth: item.maxWidth ?? '35rem',
        subtitle: item.dialogSubtitle,
        title: item.titleText ?? item.title,
        view: item.component,
      },
      {},
      { closeOn: ['close', 'update:modelValue'] },
    )
  }

  return {
    openShortcutDialog,
    visibleShortcuts,
  }
}
