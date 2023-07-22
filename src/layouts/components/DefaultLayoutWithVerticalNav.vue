<script lang="ts" setup>
import VerticalNavSectionTitle from '@/@layouts/components/VerticalNavSectionTitle.vue'
import VerticalNavLayout from '@layouts/components/VerticalNavLayout.vue'
import VerticalNavLink from '@layouts/components/VerticalNavLink.vue'

// Components
import Footer from '@/layouts/components/Footer.vue'
import NavbarThemeSwitcher from '@/layouts/components/NavbarThemeSwitcher.vue'
import SearchBar from '@/layouts/components/SearchBar.vue'
import ShortcutBar from '@/layouts/components/ShortcutBar.vue'
import UserProfile from '@/layouts/components/UserProfile.vue'
</script>

<template>
  <VerticalNavLayout>
    <!-- 👉 Navbar -->
    <template #navbar="{ toggleVerticalOverlayNavActive }">
      <div class="d-flex h-100 align-center mx-1">
        <!-- 👉 Vertical Nav Toggle -->
        <IconBtn
          class="ms-n2 d-lg-none"
          @click="toggleVerticalOverlayNavActive(true)"
        >
          <VIcon icon="mdi-menu" />
        </IconBtn>

        <!-- 👉 Search Bar -->
        <SearchBar />

        <VSpacer />

        <!-- 👉 Github -->
        <IconBtn
          class="me-2"
          href="https://github.com/jxxghp/MoviePilot"
          target="_blank"
          rel="noopener noreferrer"
        >
          <VIcon icon="mdi-github" />
        </IconBtn>

        <!-- 👉 Shortcuts -->
        <ShortcutBar />

        <!-- 👉 Theme -->
        <NavbarThemeSwitcher class="me-2" />

        <!-- 👉 UserProfile -->
        <UserProfile />
      </div>
    </template>

    <template #vertical-nav-content>
      <VerticalNavLink
        :item="{
          title: '仪表板',
          icon: 'mdi-home-outline',
          to: '/dashboard',
        }"
      />

      <!-- 👉 发现 -->
      <VerticalNavSectionTitle
        :item="{
          heading: '发现',
        }"
      />
      <VerticalNavLink
        :item="{
          title: '推荐',
          icon: 'mdi-table-star',
          to: '/ranking',
        }"
      />
      <VerticalNavLink
        :item="{
          title: '资源搜索',
          icon: 'mdi-magnify',
          to: '/resource',
        }"
      />

      <!-- 👉 订阅 -->
      <VerticalNavSectionTitle
        :item="{
          heading: '订阅',
        }"
      />
      <VerticalNavLink
        :item="{
          title: '电影',
          icon: 'mdi-movie-check-outline',
          to: '/subscribe-movie',
        }"
      />
      <VerticalNavLink
        :item="{
          title: '电视剧',
          icon: 'mdi-television-classic',
          to: '/subscribe-tv',
        }"
      />
      <VerticalNavLink
        :item="{
          title: '日历',
          icon: 'mdi-calendar',
          to: '/calendar',
        }"
      />
      <!-- 👉 整理 -->
      <VerticalNavSectionTitle
        :item="{
          heading: '整理',
        }"
      />
      <VerticalNavLink
        :item="{
          title: '正在下载',
          icon: 'mdi-download-outline',
          to: '/downloading',
        }"
      />
      <VerticalNavLink
        :item="{
          title: '历史记录',
          icon: 'mdi-history',
          to: '/history',
        }"
      />

      <!-- 👉 系统 -->
      <VerticalNavSectionTitle
        :item="{
          heading: '系统',
        }"
      />
      <VerticalNavLink
        :item="{
          title: '插件',
          icon: 'mdi-apps',
          to: '/plugin',
        }"
      />
      <VerticalNavLink
        :item="{
          title: '站点管理',
          icon: 'mdi-web',
          to: '/site',
        }"
      />
      <VerticalNavLink
        :item="{
          title: '设定',
          icon: 'mdi-cog',
          to: '/setting',
        }"
      />
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
