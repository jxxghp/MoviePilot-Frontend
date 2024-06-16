<script setup lang="ts">
import { NavMenu } from '@/@layouts/types'
import { SystemNavMenus } from '@/router/menu'
import store from '@/store'
import draggable from 'vuedraggable'

// 从Vuex Store中获取superuser信息
const superUser = store.state.auth.superUser

// APP图标顺序
const appOrder = ref<string[]>([])

// 根据分类获取菜单列表
const getMenuList = () => {
  return SystemNavMenus.filter((item: NavMenu) => !item.admin || superUser)
}

// APP列表
const appList = ref<NavMenu[]>(getMenuList())

// 保存APP图标顺序到localStorage
function saveAppsOrder() {
  appOrder.value = appList.value.map(app => app.title)
  localStorage.setItem('MP_APPS_ORDER', JSON.stringify(appOrder.value))
}

onMounted(() => {
  const localOrder = localStorage.getItem('MP_APPS_ORDER')
  if (localOrder) {
    appOrder.value = JSON.parse(localOrder)
    // 对appList进行排序
    appList.value.sort((a, b) => {
      const aIndex = appOrder.value.findIndex(item => item === a.title)
      const bIndex = appOrder.value.findIndex(item => item === b.title)
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
    })
  }
})
</script>
<template>
  <div class="ps ps--active-y mx-3 appcenter-grid" tabindex="0">
    <draggable
      v-model="appList"
      item-key="title"
      tag="VRow"
      delay="300"
      @end="saveAppsOrder"
      :component-data="{ 'class': 'ma-0 mt-n1' }"
    >
      <template #item="{ element }">
        <VCol cols="6" md="4" lg="3" class="text-center cursor-pointer shortcut-icon select-none">
          <VCard class="pa-4" :to="element.to" variant="flat">
            <VAvatar size="64" variant="text">
              <VIcon size="48" :icon="element.icon" color="primary" />
            </VAvatar>
            <h6 class="text-base font-weight-medium mt-2 mb-0">{{ element.full_title || element.title }}</h6>
          </VCard>
        </VCol>
      </template>
    </draggable>
  </div>
</template>

<style type="scss">
.appcenter-grid .v-card {
  /* stylelint-disable-next-line property-no-vendor-prefix */
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  background-color: rgb(var(--v-theme-surface), 0.8);
}
</style>
