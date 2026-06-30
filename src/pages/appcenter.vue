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

// 根据header属性对应用进行分类（含插件侧栏项，与桌面端侧栏一致）
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
    <VContainer>
      <!-- 遍历所有分组 -->
      <div v-for="(apps, header) in appGroups" :key="header" class="mb-3">
        <VListSubheader class="ps-1">
          {{ header }}
        </VListSubheader>
        <!-- 分组内容 - 使用卡片包装 -->
        <VCard variant="flat" class="settings-section-card">
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
                <VAvatar size="42" color="primary" variant="text" class="me-3">
                  <VIcon :icon="app.icon as string" size="24"></VIcon>
                </VAvatar>
              </template>

              <VListItemTitle class="font-weight-medium">
                {{ app.full_title || app.title }}
              </VListItemTitle>

              <VListItemSubtitle v-if="app.description">
                {{ app.description }}
              </VListItemSubtitle>

              <template #append>
                <VIcon icon="mdi-chevron-right"></VIcon>
              </template>
            </VListItem>
          </VList>
        </VCard>
      </div>
    </VContainer>
  </div>
</template>

<style lang="scss" scoped>
.app-settings-container {
  margin-block: 0;
  margin-inline: auto;
  max-inline-size: 960px;
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
    background-color: rgba(var(--v-theme-primary), 0.05);
  }
}
</style>
