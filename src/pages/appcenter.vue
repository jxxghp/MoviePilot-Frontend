<script setup lang="ts">
import { NavMenu } from '@/@layouts/types'
import { SystemNavMenus } from '@/router/menu'
import store from '@/store'

// 从Vuex Store中获取superuser信息
const superUser = store.state.auth.superUser

// 根据分类获取菜单列表
const getMenuList = () => {
  return SystemNavMenus.filter((item: NavMenu) => !item.admin || superUser)
}
</script>
<template>
  <div class="ps ps--active-y mx-3" tabindex="0">
    <VRow class="ma-0 mt-n1">
      <VCol cols="6" md="4" lg="3" class="text-center cursor-pointer shortcut-icon" v-for="item in getMenuList()">
        <VCard class="pa-4" :to="item.to" variant="flat">
          <VAvatar size="64" variant="text">
            <VIcon size="48" :icon="item.icon" color="primary" />
          </VAvatar>
          <h6 class="text-base font-weight-medium mt-2 mb-0">{{ item.full_title || item.title }}</h6>
        </VCard>
      </VCol>
    </VRow>
  </div>
</template>
