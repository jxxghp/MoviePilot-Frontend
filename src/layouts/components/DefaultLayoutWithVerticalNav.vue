<script lang="ts" setup>
import VerticalNavSectionTitle from "@/@layouts/components/VerticalNavSectionTitle.vue";
import VerticalNavLayout from "@layouts/components/VerticalNavLayout.vue";
import VerticalNavLink from "@layouts/components/VerticalNavLink.vue";

// Components
import Footer from "@/layouts/components/Footer.vue";
import NavbarThemeSwitcher from "@/layouts/components/NavbarThemeSwitcher.vue";
import UserProfile from "@/layouts/components/UserProfile.vue";

const router = useRouter();

// 搜索词
const searchWord = ref<string>("");

// 搜索弹窗
const searchDialog = ref(false);

// Search
const search = () => {
  if (!searchWord.value) {
    return;
  }
  searchDialog.value = false;
  router.push({
    path: "/browse/media/search",
    query: {
      title: searchWord.value,
    },
  });
};
</script>

<template>
  <VerticalNavLayout>
    <!-- 👉 navbar -->
    <template #navbar="{ toggleVerticalOverlayNavActive }">
      <div class="d-flex h-100 align-center mx-1">
        <!-- 👉 Vertical nav toggle in overlay mode -->
        <IconBtn class="ms-n2 d-lg-none" @click="toggleVerticalOverlayNavActive(true)">
          <VIcon icon="mdi-menu" />
        </IconBtn>

        <!-- 👉 Search -->
        <div class="d-flex align-center cursor-pointer" style="user-select: none">
          <!-- 👉 Search Trigger button -->
          <VDialog
            v-model="searchDialog"
            max-width="600"
            transition="dialog-top-transition"
          >
            <!-- Dialog Activator -->
            <template #activator="{ props }">
              <IconBtn class="d-lg-none" v-bind="props">
                <VIcon icon="mdi-magnify" />
              </IconBtn>
            </template>
            <!-- Dialog Content -->
            <VCard title="搜索">
              <VCardText>
                <VRow>
                  <VCol cols="12">
                    <VTextField v-model="searchWord" label="电影、电视剧名称" />
                  </VCol>
                </VRow>
              </VCardText>

              <VCardActions>
                <VSpacer />
                <VBtn @click="search" @keydown.enter="search"> 搜索 </VBtn>
              </VCardActions>
            </VCard>
          </VDialog>
        </div>

        <span class="w-1/5">
          <VTextField
            key="search_navbar"
            v-model="searchWord"
            class="d-none d-lg-block text-disabled"
            density="compact"
            variant="solo"
            label="搜索电影、电视剧"
            append-inner-icon="mdi-magnify"
            single-line
            hide-details
            @click:append-inner="search"
            @keydown.enter="search"
            flat
            rounded
          />
        </span>

        <VSpacer />

        <IconBtn
          class="me-2"
          href="https://github.com/jxxghp/MoviePilot"
          target="_blank"
          rel="noopener noreferrer"
        >
          <VIcon icon="mdi-github" />
        </IconBtn>

        <IconBtn class="me-2">
          <VIcon icon="mdi-bell-outline" />
        </IconBtn>

        <NavbarThemeSwitcher class="me-2" />

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

      <!-- 👉 设置 -->
      <VerticalNavSectionTitle
        :item="{
          heading: '设置',
        }"
      />
      <VerticalNavLink
        :item="{
          title: '站点',
          icon: 'mdi-web',
          to: '/site',
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
          title: '用户',
          icon: 'mdi-account',
          to: '/account-setting',
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
