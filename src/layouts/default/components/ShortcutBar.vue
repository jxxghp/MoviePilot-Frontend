<script lang="ts" setup>
import { getQueryValue } from '@/@core/utils'
import { useShortcutTools } from '@/composables/useShortcutTools'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()
const { visibleShortcuts, openShortcutDialog: openShortcutTool } = useShortcutTools()

// App捷径
const appsMenu = ref(false)

// 菜单最大宽度
const menuMaxWidth = ref(420)

/** 打开快捷工具对应的共享弹窗。 */
function openShortcutDialog(item: (typeof visibleShortcuts.value)[number]) {
  appsMenu.value = false
  openShortcutTool(item)
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
