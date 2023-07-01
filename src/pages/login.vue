<script setup lang="ts">
import { requiredValidator } from "@/@validators";
import api from "@/api";
import router from "@/router";
import logo from "@images/logo.svg?raw";
import type { VForm } from "vuetify/components/VForm";
import { useStore } from "vuex";

// Vuex Store
const store = useStore();

// 表单
const form = ref({
  username: "",
  password: "",
  remember: true,
});
const refForm = ref<InstanceType<typeof VForm> | null>(null);

// 密码输入
const isPasswordVisible = ref(false);

// 错误信息
const errorMessage = ref("");

// 背景图片
const backgroundImageUrl = ref("");

// 获取背景图片
const fetchBackgroundImage = async () => {
  api
    .get("/login/wallpaper")
    .then((response: any) => {
      backgroundImageUrl.value = response.message;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

// 登录获取token事件
const login = () => {
  errorMessage.value = "";
  // 进行表单校验
  if (!form.value.username || !form.value.password) {
    return;
  }

  // 用户名密码
  const formData = new FormData();

  formData.append("username", form.value.username);
  formData.append("password", form.value.password);

  // 请求token
  api
    .post("/login/access-token", formData, {
      headers: {
        Accept: "application/json", // 设置 Accept 类型
      },
    })
    .then((response: any) => {
      // 获取token
      const token = response.access_token;

      // 更新token和remember状态到Vuex Store
      store.dispatch("auth/updateToken", token);
      store.dispatch("auth/updateRemember", form.value.remember);

      // 跳转到首页
      router.push("/");
    })
    .catch((error: any) => {
      // 登录失败，显示错误提示
      if (!error.response) errorMessage.value = "登录失败，请检查网络连接";
      else if (error.response.status === 401)
        errorMessage.value = "登录失败，请检查用户名和密码是否正确";
      else if (error.response.status === 403)
        errorMessage.value = "登录失败，您没有权限访问";
      else if (error.response.status === 500) errorMessage.value = "登录失败，服务器错误";
      else
        errorMessage.value = `登录失败 ${error.response.status}，请检查用户名和密码是否正确`;
    });
};

// 自动登录
onMounted(() => {
  // 从Vuex Store中获取token和remember状态
  const token = store.state.auth.token;
  const remember = store.state.auth.remember;

  // 如果token存在，且保持登录状态为true，则跳转到首页
  if (token && remember) {
    router.push("/");
  } else {
    // 获取背景图片
    fetchBackgroundImage();
  }
});
</script>

<template>
  <div
    class="auth-wrapper d-flex align-center justify-center pa-4 w-full h-full overflow-hidden"
    :style="{ backgroundImage: `url(${backgroundImageUrl})` }"
  >
    <VCard class="auth-card pa-7 backdrop-blur-xl bg-white/50" width="25rem" theme="light">
      <VCardItem class="justify-center mb-7">
        <template #prepend>
          <div class="d-flex">
            <div v-html="logo" />
          </div>
        </template>

        <VCardTitle class="font-weight-semibold text-2xl text-uppercase">
          MoviePilot
        </VCardTitle>
      </VCardItem>

      <VCardText>
        <VForm @submit.prevent="() => {}" ref="refForm">
          <VRow>
            <!-- username -->
            <VCol cols="12">
              <VTextField
                v-model="form.username"
                label="用户名"
                type="text"
                :rules="[requiredValidator]"
              />
            </VCol>

            <!-- password -->
            <VCol cols="12">
              <VTextField
                v-model="form.password"
                label="密码"
                :type="isPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="
                  isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
                "
                :rules="[requiredValidator]"
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
              />

              <div v-if="errorMessage" class="text-error mt-1">
                {{ errorMessage }}
              </div>

              <!-- remember me checkbox -->
              <div class="d-flex align-center justify-space-between flex-wrap mt-1 mb-4">
                <VCheckbox v-model="form.remember" label="保持登录" required />
              </div>

              <!-- login button -->
              <VBtn block type="submit" @click="login"> 登录 </VBtn>
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
    </VCard>
  </div>
</template>

<style lang="scss">
@use "@core/scss/pages/page-auth.scss";
</style>
