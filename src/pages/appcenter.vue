<script setup lang="ts">
import { NavMenu } from '@/@layouts/types'
import { getNavMenus } from '@/router/i18n-menu'
import { usePluginSidebarNavStore, useUserStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { filterPluginSidebarNavEntries } from '@/utils/pluginSidebarNav'
import { buildUserPermissionContext, filterMenusByPermission } from '@/utils/permission'

// 国际化
const { t } = useI18n()

const userStore = useUserStore()
const pluginSidebarNavStore = usePluginSidebarNavStore()

// 获取用户权限信息
const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))

// 应用分组（以header分组）
const appGroups = ref<Record<string, NavMenu[]>>({})

/** 按菜单 header 聚合内置与插件入口，并保持与桌面侧栏一致的权限过滤结果。 */
async function categorizeApps() {
  const allMenus = getNavMenus(t)
  const filteredMenus = filterMenusByPermission(allMenus, userPermissions.value)
  let menus = filteredMenus.filter((item: NavMenu) => !item.footer)

  await pluginSidebarNavStore.ensureSidebarNav()
  if (pluginSidebarNavStore.items.length > 0) {
    const pluginNavMenus = filterPluginSidebarNavEntries(
      pluginSidebarNavStore.items,
      t,
      userPermissions.value,
    ).map(e => e.navMenu)
    menus = [...menus, ...pluginNavMenus]
  }

  const groupedMenus: Record<string, NavMenu[]> = {}

  menus.forEach(menu => {
    const header = menu.header || t('appcenter.others')
    if (!groupedMenus[header]) {
      groupedMenus[header] = []
    }
    groupedMenus[header].push(menu)
  })

  appGroups.value = groupedMenus
}

onMounted(() => {
  categorizeApps()
})
</script>
<template>
  <div class="app-settings-container">
    <VContainer class="app-settings-content">
      <!-- 遍历所有分组 -->
      <section v-for="(apps, header) in appGroups" :key="header" class="settings-section">
        <VListSubheader class="settings-section-title">
          {{ header }}
        </VListSubheader>
        <!-- 分组内容 - 使用卡片包装 -->
        <VCard variant="flat" class="app-grouped-list settings-section-card">
          <VList lines="one" class="settings-list">
            <VListItem
              v-for="(app, appIndex) in apps"
              :key="`${header}-${appIndex}-${String(app.to)}`"
              :to="app.to || ''"
              color="primary"
              class="settings-list-item"
              rounded="0"
            >
              <template #prepend>
                <VAvatar
                  size="42"
                  color="primary"
                  variant="text"
                  class="settings-list-icon me-3"
                  :class="`settings-list-icon--tone-${app.iconColor || 'primary'}`"
                >
                  <VIcon :icon="app.icon as string" size="24"></VIcon>
                </VAvatar>
              </template>

              <VListItemTitle class="settings-list-title font-weight-medium">
                {{ app.full_title || app.title }}
              </VListItemTitle>

              <VListItemSubtitle v-if="app.description" class="settings-list-subtitle">
                {{ app.description }}
              </VListItemSubtitle>

              <template #append>
                <VIcon class="settings-list-chevron" icon="mdi-chevron-right"></VIcon>
              </template>

              <span
                v-if="appIndex < apps.length - 1"
                class="settings-list-separator"
                aria-hidden="true"
              ></span>
            </VListItem>
          </VList>
        </VCard>
      </section>
    </VContainer>
  </div>
</template>

<style lang="scss" scoped>
.app-settings-container {
  inline-size: 100%;
  margin-block: 0;
  margin-inline: auto;
  max-inline-size: 960px;
  overflow-x: hidden;
}

.settings-section {
  margin-block-end: 12px;
}

.settings-section-title {
  padding-inline-start: 4px;
}

.settings-section-card {
  overflow: hidden;
  border: var(--app-surface-border);
  backdrop-filter: blur(10px);
  background-color: rgb(var(--v-theme-surface));
  box-shadow: var(--app-surface-shadow);
  transition: border-color 0.2s ease, border-width 0.2s ease, box-shadow 0.2s ease;
}

.settings-list {
  padding: 0;
}

.settings-list-item {
  padding-block: 8px;
  padding-inline: 12px;
  transition: background-color 0.2s;

  &:not(:last-child) {
    border-block-end: 1px solid rgba(var(--v-border-color), 0.12);
  }

  &:hover {
    background-color: var(--app-grouped-list-hover-background);
  }
}

@media (width <= 768px) {
  .app-settings-content {
    box-sizing: border-box;
    max-inline-size: 100%;
    overflow-x: hidden;
    padding-block: 8px calc(24px + env(safe-area-inset-bottom));
    padding-inline: 12px;
  }

  .settings-section {
    margin-block-end: 18px;
  }

  .settings-section:last-child {
    margin-block-end: 0;
  }

  .settings-section-title {
    min-block-size: auto;
    padding-block: 0 7px;
    padding-inline: 12px;
    color: var(--app-grouped-list-header-color);
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: 0.015em;
    line-height: 1.25rem;
    text-transform: none;
  }

  .settings-section-card {
    max-inline-size: 100%;
    overflow-x: hidden;
    border-radius: var(--app-grouped-list-radius) !important;
  }

  .settings-list {
    max-inline-size: 100%;
    overflow-x: hidden;
    background: transparent;
    border-radius: inherit !important;
  }

  .settings-list-item {
    max-inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 58px;
    overflow: hidden;
    padding-block: 7px;
    padding-inline: 12px 9px;
    border-block-end: 0 !important;
    border-radius: 0 !important;
  }

  .settings-list-separator {
    position: absolute;
    background-color: var(--app-grouped-list-separator-color);
    block-size: 1px;
    inset-block-end: 0;
    inset-inline: var(--app-grouped-list-content-offset) 0;
    pointer-events: none;
    z-index: 2;
  }

  .settings-list-item:active {
    background-color: var(--app-grouped-list-active-background);
  }

  .settings-list-icon {
    --app-grouped-list-icon-rgb: var(--app-grouped-list-icon-primary-rgb);

    block-size: var(--app-grouped-list-icon-size) !important;
    inline-size: var(--app-grouped-list-icon-size) !important;
    border-radius: max(var(--app-control-radius), 8px) !important;
    background: rgba(var(--app-grouped-list-icon-rgb), var(--app-grouped-list-icon-opacity)) !important;
    color: var(--app-grouped-list-icon-foreground) !important;
  }

  .settings-list-icon--tone-info {
    --app-grouped-list-icon-rgb: var(--app-grouped-list-icon-info-rgb);
  }

  .settings-list-icon--tone-success {
    --app-grouped-list-icon-rgb: var(--app-grouped-list-icon-success-rgb);
  }

  .settings-list-icon--tone-warning {
    --app-grouped-list-icon-rgb: var(--app-grouped-list-icon-warning-rgb);
  }

  .settings-list-icon--tone-secondary {
    --app-grouped-list-icon-rgb: var(--app-grouped-list-icon-secondary-rgb);
  }

  .settings-list-item :deep(.v-list-item__content) {
    min-inline-size: 0;
    overflow: hidden;
  }

  .settings-list-icon :deep(.v-icon) {
    font-size: var(--app-grouped-list-icon-glyph-size) !important;
  }

  .settings-list-title {
    font-size: 1rem;
    font-weight: 500 !important;
    letter-spacing: 0;
    line-height: 1.375rem;
  }

  .settings-list-subtitle {
    margin-block-start: 2px;
    color: rgba(var(--v-theme-on-surface), 0.58);
    font-size: 0.75rem;
    line-height: 1rem;
  }

  .settings-list-chevron {
    color: var(--app-grouped-list-chevron-color);
    font-size: 1.375rem;
  }
}
</style>
