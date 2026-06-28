<script lang="ts" setup>
import type { Component } from 'vue'
import { getQueryValue } from '@/@core/utils'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, filterItemsByPermission, hasItemPermission, type PermissionProtectedItem } from '@/utils/permission'

// 国际化
const { t } = useI18n()
const userStore = useUserStore()
const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))

// 快捷工具只在弹窗打开时使用，按需加载避免默认布局首屏带上所有 system 视图。
const NameTestView = defineAsyncComponent(() => import('@/views/system/NameTestView.vue'))
const NetTestView = defineAsyncComponent(() => import('@/views/system/NetTestView.vue'))
const RuleTestView = defineAsyncComponent(() => import('@/views/system/RuleTestView.vue'))
const ModuleTestView = defineAsyncComponent(() => import('@/views/system/ModuleTestView.vue'))
const WordsView = defineAsyncComponent(() => import('@/views/system/WordsView.vue'))
const CacheView = defineAsyncComponent(() => import('@/views/system/CacheView.vue'))
const AccountSettingService = defineAsyncComponent(() => import('@/views/system/ServiceView.vue'))
const ShortcutLogDialog = defineAsyncComponent(() => import('@/components/dialog/ShortcutLogDialog.vue'))
const ShortcutToolDialog = defineAsyncComponent(() => import('@/components/dialog/ShortcutToolDialog.vue'))

type ShortcutItem = PermissionProtectedItem & {
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

// App捷径
const appsMenu = ref(false)

// 菜单最大宽度
const menuMaxWidth = ref(420)

// 定义捷径列表
const shortcuts: ShortcutItem[] = [
  {
    title: t('shortcut.recognition.title'),
    subtitle: t('shortcut.recognition.subtitle'),
    icon: 'mdi-text-recognition',
    dialog: 'nameTest',
    component: NameTestView,
    maxWidth: '45rem',
    titleText: t('shortcut.recognition.title'),
  },
  {
    title: t('shortcut.rule.title'),
    subtitle: t('shortcut.rule.subtitle'),
    icon: 'mdi-filter-cog',
    dialog: 'ruleTest',
    component: RuleTestView,
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
    icon: 'mdi-list-box',
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

/** 打开快捷工具对应的共享弹窗。 */
function openShortcutDialog(item: (typeof shortcuts)[number]) {
  if (!hasItemPermission(item, userPermissions.value)) return

  appsMenu.value = false

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

onMounted(() => {
  const shortcut = getQueryValue('shortcut')
  if (shortcut) {
    const found = visibleShortcuts.value.find(item => item.dialog === shortcut)
    if (found) {
      openShortcutDialog(found)
    }
  }
})
</script>

<template>
  <VMenu
    v-model="appsMenu"
    :max-width="menuMaxWidth"
    width="100%"
    max-height="560"
    location="top end"
    origin="top end"
    close-on-content-click
    close-on-back
    scrim
  >
    <!-- Menu Activator -->
    <template #activator="{ props }">
      <IconBtn class="ms-2" v-bind="props">
        <VIcon icon="mdi-card-multiple-outline" />
      </IconBtn>
    </template>
    <!-- Menu Content -->
    <VCard class="overflow-hidden">
      <VCardItem class="py-3">
        <VCardTitle>{{ t('shortcut.title') }}</VCardTitle>
        <template #append>
          <IconBtn @click="appsMenu = false">
            <VIcon icon="mdi-close" />
          </IconBtn>
        </template>
      </VCardItem>
      <VDivider />
      <div class="pa-3">
        <div class="grid grid-cols-2 gap-3">
          <!-- 循环渲染快捷方式 -->
          <div v-for="(item, index) in visibleShortcuts" :key="index">
            <VHover v-slot="hover">
              <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
              <div v-bind="hover.props" class="shortcut-card-hover-area h-full">
                <VCard
                  flat
                  :ripple="false"
                  class="app-hover-lift-card pa-2 d-flex align-center cursor-pointer border h-full w-100"
                  :class="{ 'app-hover-lift-card--hovering': hover.isHovering }"
                  @click="openShortcutDialog(item)"
                >
                  <VAvatar variant="text" size="48" rounded="lg">
                    <VIcon color="primary" :icon="item.icon" size="24" />
                  </VAvatar>
                  <div>
                    <div class="text-body-1 text-high-emphasis font-weight-medium">{{ item.title }}</div>
                    <div class="text-caption text-medium-emphasis">{{ item.subtitle }}</div>
                  </div>
                </VCard>
              </div>
            </VHover>
          </div>
        </div>
      </div>
    </VCard>
  </VMenu>
</template>

<style scoped>
.shortcut-card-hover-area {
  inline-size: 100%;
}
</style>
