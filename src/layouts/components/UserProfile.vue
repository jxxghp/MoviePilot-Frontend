<script setup lang="ts">
import api from "@/api";
import { User } from "@/api/types";
import router from "@/router";
import avatar1 from "@images/avatars/avatar-1.png";
import { useStore } from "vuex";

// Vuex Store
const store = useStore();

// 当前用户信息
const accountInfo = ref<User>({
  id: 0,
  name: "",
  password: "",
  email: "",
  is_active: false,
  is_superuser: false,
  avatar: "",
});

// 调用API，加载当前用户数据
const loadAccountInfo = async () => {
  try {
    const user: User = await api.get(`user/current`);
    accountInfo.value = user;
    if (!accountInfo.value.avatar) accountInfo.value.avatar = avatar1;
  } catch (error) {
    console.log(error);
  }
};

// 执行注销操作
const logout = () => {
  // 清除登录状态信息
  store.dispatch("auth/clearToken");

  // 重定向到登录页面或其他适当的页面
  router.push("/login");
};

// 页面加载时，加载当前用户数据
onMounted(() => {
  loadAccountInfo();
});
</script>

<template>
  <VBadge dot location="bottom right" offset-x="3" offset-y="3" color="success" bordered>
    <VAvatar class="cursor-pointer" color="primary" variant="tonal">
      <VImg :src="accountInfo.avatar || avatar1" />

      <!-- SECTION Menu -->
      <VMenu activator="parent" width="230" location="bottom end" offset="14px">
        <VList>
          <!-- 👉 User Avatar & Name -->
          <VListItem>
            <template #prepend>
              <VListItemAction start>
                <VBadge
                  dot
                  location="bottom right"
                  offset-x="3"
                  offset-y="3"
                  color="success"
                >
                  <VAvatar color="primary" variant="tonal">
                    <VImg :src="avatar1" />
                  </VAvatar>
                </VBadge>
              </VListItemAction>
            </template>

            <VListItemTitle class="font-weight-semibold">
              {{ accountInfo.is_superuser ? "管理员" : "普通用户" }}
            </VListItemTitle>
            <VListItemSubtitle>{{ accountInfo.name }}</VListItemSubtitle>
          </VListItem>
          <VDivider class="my-2" />

          <!-- 👉 Profile -->
          <VListItem link to="account-setting">
            <template #prepend>
              <VIcon class="me-2" icon="mdi-account-outline" size="22" />
            </template>

            <VListItemTitle>配置中心</VListItemTitle>
          </VListItem>

          <!-- 👉 FAQ -->
          <VListItem link>
            <template #prepend>
              <VIcon class="me-2" icon="mdi-help-circle-outline" size="22" />
            </template>

            <VListItemTitle>帮助</VListItemTitle>
          </VListItem>

          <!-- Divider -->
          <VDivider class="my-2" />

          <!-- 👉 Logout -->
          <VListItem @click="logout">
            <template #prepend>
              <VIcon class="me-2" icon="mdi-logout" size="22" />
            </template>

            <VListItemTitle>注销</VListItemTitle>
          </VListItem>
        </VList>
      </VMenu>
      <!-- !SECTION -->
    </VAvatar>
  </VBadge>
</template>
