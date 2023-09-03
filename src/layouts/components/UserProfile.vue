<script setup lang="ts">
import { useStore } from 'vuex'
import router from '@/router'
import type { User } from '@/api/types'

// Vuex Store
const store = useStore()

// 执行注销操作
function logout() {
  // 清除登录状态信息
  store.dispatch('auth/clearToken')

  // 重定向到登录页面或其他适当的页面
  router.push('/login')
}

// 获取当前用户信息
const accountInfo: User = inject('accountInfo') as User
</script>

<template>
  <VAvatar
    class="cursor-pointer"
    color="primary"
    variant="tonal"
  >
    <VImg :src="accountInfo.avatar" />

    <!-- SECTION Menu -->
    <VMenu
      activator="parent"
      width="230"
      location="bottom end"
      offset="14px"
    >
      <VList>
        <!-- 👉 User Avatar & Name -->
        <VListItem>
          <template #prepend>
            <VListItemAction start>
              <VAvatar
                color="primary"
                variant="tonal"
              >
                <VImg :src="accountInfo.avatar" />
              </VAvatar>
            </VListItemAction>
          </template>

          <VListItemTitle class="font-weight-semibold">
            {{ accountInfo.is_superuser ? "管理员" : "普通用户" }}
          </VListItemTitle>
          <VListItemSubtitle>{{ accountInfo.name }}</VListItemSubtitle>
        </VListItem>
        <VDivider class="my-2" />

        <!-- 👉 Profile -->
        <VListItem
          v-if="accountInfo.is_superuser"
          link
          to="setting"
        >
          <template #prepend>
            <VIcon
              class="me-2"
              icon="mdi-account-outline"
              size="22"
            />
          </template>

          <VListItemTitle>设定</VListItemTitle>
        </VListItem>

        <!-- 👉 FAQ -->
        <VListItem
          href="https://github.com/jxxghp/MoviePilot/blob/main/README.md"
          target="_blank"
        >
          <template #prepend>
            <VIcon
              class="me-2"
              icon="mdi-help-circle-outline"
              size="22"
            />
          </template>

          <VListItemTitle>帮助</VListItemTitle>
        </VListItem>

        <!-- Divider -->
        <VDivider class="my-2" />

        <!-- 👉 Logout -->
        <VListItem @click="logout">
          <template #prepend>
            <VIcon
              class="me-2"
              icon="mdi-logout"
              size="22"
            />
          </template>

          <VListItemTitle>注销</VListItemTitle>
        </VListItem>
      </VList>
    </VMenu>
    <!-- !SECTION -->
  </VAvatar>
</template>
