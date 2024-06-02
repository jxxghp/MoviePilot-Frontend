<script lang="ts" setup>
import VerticalNavSectionTitle from '@/@layouts/components/VerticalNavSectionTitle.vue'
import VerticalNavLayout from '@layouts/components/VerticalNavLayout.vue'
import VerticalNavLink from '@layouts/components/VerticalNavLink.vue'
import Footer from '@/layouts/components/Footer.vue'
import NavbarThemeSwitcher from '@/layouts/components/NavbarThemeSwitcher.vue'
import UserNofification from '@/layouts/components/UserNotification.vue'
import SearchBar from '@/layouts/components/SearchBar.vue'
import ShortcutBar from '@/layouts/components/ShortcutBar.vue'
import UserProfile from '@/layouts/components/UserProfile.vue'
import store from '@/store'
import { SystemNavMenus } from '@/router/menu'
import { NavMenu } from '@/@layouts/types'

// 从Vuex Store中获取superuser信息
const superUser = store.state.auth.superUser

// 根据分类获取菜单列表
const getMenuList = (header: string) => {
  return SystemNavMenus.filter((item: NavMenu) => item.header === header && (!item.admin || superUser))
}
</script>

<template>
  <VerticalNavLayout>
    <!-- 👉 Navbar -->
    <template #navbar="{ toggleVerticalOverlayNavActive }">
      <div class="d-flex h-100 align-center mx-1">
        <!-- 👉 Vertical Nav Toggle -->
        <IconBtn class="ms-n2 d-lg-none" @click="toggleVerticalOverlayNavActive(true)">
          <VIcon icon="mdi-menu" />
        </IconBtn>
        <!-- 👉 Search Bar -->
        <SearchBar />
        <!-- 👉 Spacer -->
        <VSpacer />
        <!-- 👉 Shortcuts -->
        <ShortcutBar v-if="superUser" />
        <!-- 👉 Theme -->
        <NavbarThemeSwitcher />
        <!-- 👉 Notification -->
        <UserNofification />
        <!-- 👉 UserProfile -->
        <UserProfile />
      </div>
    </template>

    <template #vertical-nav-content>
      <VerticalNavLink v-for="item in getMenuList('开始')" :item="item" />
      <!-- 👉 发现 -->
      <VerticalNavSectionTitle
        :item="{
          heading: '发现',
        }"
      />
      <VerticalNavLink v-for="item in getMenuList('发现')" :item="item" />
      <!-- 👉 订阅 -->
      <VerticalNavSectionTitle
        :item="{
          heading: '订阅',
        }"
      />
      <VerticalNavLink v-for="item in getMenuList('订阅')" :item="item" />
      <!-- 👉 整理 -->
      <VerticalNavSectionTitle
        :item="{
          heading: '整理',
        }"
      />
      <VerticalNavLink v-for="item in getMenuList('整理')" :item="item" />
      <!-- 👉 系统 -->
      <VerticalNavSectionTitle
        v-if="superUser"
        :item="{
          heading: '系统',
        }"
      />
      <VerticalNavLink v-for="item in getMenuList('系统')" :item="item" />
    </template>

    <template #after-vertical-nav-items />
    <!-- 👉 Pages -->
    <slot />
    <!-- 👉 Footer -->
    <template #footer>
      <Footer />
    </template>
  </VerticalNavLayout>
</template>

<style lang="scss" scoped>
.meta-key {
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  block-size: 1.5625rem;
  line-height: 1.3125rem;
  padding-block: 0.125rem;
  padding-inline: 0.25rem;
}
</style>
