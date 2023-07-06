<script lang="ts" setup>
import { requiredValidator } from "@/@validators";
import api from "@/api";
import { Site } from "@/api/types";
import { useToast } from "vue-toast-notification";
// 输入参数
const props = defineProps({
  site: Object as PropType<Site>,
  width: String,
  height: String,
});

// 密码输入
const isPasswordVisible = ref(false);

// 图标
const siteIcon = ref<string>("");

// 提示框
const $toast = useToast();

// 测试按钮文字
const testButtonText = ref("测试");
// 测试按钮可用性
const testButtonDisable = ref(false);

// 更新按钮文字
const updateButtonText = ref("更新");
// 更新按钮可用性
const updateButtonDisable = ref(false);

// 更新站点Cookie UA弹窗
const siteCookieDialog = ref(false);

// 用户名密码表单
const userPwForm = ref({
  username: "",
  password: "",
});

// 查询站点图标
const getSiteIcon = async () => {
  try {
    siteIcon.value = (await api.get("site/icon/" + props.site?.id)).data.icon;
  } catch (error) {
    console.error(error);
  }
};

// 测试站点连通性
const testSite = async () => {
  try {
    testButtonText.value = "测试中 ...";
    testButtonDisable.value = true;
    const result: { [key: string]: any } = await api.get("site/test/" + props.site?.id);
    if (result.success) {
      $toast.success(`${props.site?.name} 连通性测试成功，可正常使用！`);
    } else {
      $toast.error(`${props.site?.name} 连通性测试失败：${result.message}`);
    }
    testButtonText.value = "测试";
    testButtonDisable.value = false;
  } catch (error) {
    console.error(error);
  }
};

// 打开更新站点Cookie UA弹窗
const handleSiteUpdate = async () => {
  siteCookieDialog.value = true;
};

// 调用API，更新站点Cookie UA
const updateSiteCookie = async () => {
  try {
    if (!userPwForm.value.username || !userPwForm.value.password) {
      return;
    }

    // 更新按钮状态
    siteCookieDialog.value = false;
    updateButtonText.value = "更新中 ...";
    updateButtonDisable.value = true;

    const result: { [key: string]: any } = await api.get(
      "site/cookie/" + props.site?.id,
      {
        params: {
          username: userPwForm.value.username,
          password: userPwForm.value.password,
        }
      }
    );
    if (result.success) {
      $toast.success(`${props.site?.name} 更新Cookie & UA 成功！`);
    } else {
      $toast.error(`${props.site?.name} 更新失败：${result.message}`);
    }
    updateButtonText.value = "更新";
    updateButtonDisable.value = false;
  } catch (error) {
    console.error(error);
  }
};

// 装载时查询站点图标
onMounted(() => {
  getSiteIcon();
});
</script>

<template>
  <VCard :height="props.height" :width="props.width" :flat="!props.site?.is_active" class="overflow-hidden">
    <template #image>
      <VAvatar class="absolute right-2 bottom-2" variant="flat" rounded="0">
        <VImg :src="siteIcon" />
      </VAvatar>
    </template>
    <VCardItem>
      <VCardTitle class="font-bold">{{ props.site?.name }}</VCardTitle>
      <VCardSubtitle>{{ props.site?.url }}</VCardSubtitle>
    </VCardItem>

    <div class="absolute top-0 right-0 flex items-center justify-between p-2" v-if="props.site?.is_active">
      <div class="pointer-events-none z-40 flex items-center">
        <div
          class="relative inline-flex whitespace-nowrap rounded-full border-gray-700 font-semibold leading-5 ring-gray-700">
          <div
            class="rounded-full bg-opacity-80 shadow-md w-5 border p-0 bg-green-500 border-green-400 ring-green-400 text-green-100">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clip-rule="evenodd"></path>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <VCardText class="py-2">
      <VTooltip text="浏览器仿真" v-if="props.site?.render">
        <template #activator="{ props }">
          <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-apple-safari" />
        </template>
      </VTooltip>

      <VTooltip text="代理" v-if="props.site?.proxy">
        <template #activator="{ props }">
          <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-network-outline" />
        </template>
      </VTooltip>

      <VTooltip text="流控" v-if="props.site?.limit_interval">
        <template #activator="{ props }">
          <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-speedometer" />
        </template>
      </VTooltip>

      <VTooltip text="过滤" v-if="props.site?.filter">
        <template #activator="{ props }">
          <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-filter-cog-outline" />
        </template>
      </VTooltip>
    </VCardText>

    <VCardActions>
      <VBtn @click="handleSiteUpdate" :disabled="updateButtonDisable">
        <template #prepend>
          <VIcon icon="mdi-refresh"></VIcon>
        </template>
        {{ updateButtonText }}
      </VBtn>
      <VBtn>
        <template #prepend>
          <VIcon icon="mdi-square-edit-outline"></VIcon>
        </template>
        编辑
      </VBtn>
      <VBtn @click="testSite" :disabled="testButtonDisable">
        <template #prepend>
          <VIcon icon="mdi-network-outline"></VIcon>
        </template>
        {{ testButtonText }}
      </VBtn>
    </VCardActions>
  </VCard>
  <VDialog v-model="siteCookieDialog" max-width="600">
    <!-- Dialog Content -->
    <VCard title="更新站点Cookie & UA">
      <VCardText>
        <VForm @submit.prevent="() => { }">
          <VRow>
            <VCol cols="6">
              <VTextField v-model="userPwForm.username" label="用户名" :rules="[requiredValidator]" />
            </VCol>
            <VCol cols="6">
              <VTextField v-model="userPwForm.password" label="密码" :type="isPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                @click:append-inner="isPasswordVisible = !isPasswordVisible" :rules="[requiredValidator]"
                @keydown.enter="updateSiteCookie" />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>

      <VCardActions>
        <VSpacer />
        <VBtn @click="updateSiteCookie">
          开始更新
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
