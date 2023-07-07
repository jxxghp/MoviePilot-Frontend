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

// 站点编辑弹窗
const siteInfoDialog = ref(false);

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

// 打开站点编辑弹窗
const handleSiteInfo = async () => {
  siteInfoDialog.value = true;
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
        },
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

// 调用API更新站点信息
const updateSiteInfo = async () => {
  try {
    // 更新按钮状态
    siteInfoDialog.value = false;

    const result: { [key: string]: any } = await api.put("site", siteForm);
    if (result.success) {
      $toast.success(`${props.site?.name} 更新成功！`);
    } else {
      $toast.error(`${props.site?.name} 更新失败：${result.message}`);
    }
  } catch (error) {
    $toast.error(`${props.site?.name} 更新失败！`);
    console.error(error);
  }
};

// 站点编辑表单数据
const siteForm = reactive({
  // ID
  id: props.site?.id,
  // 站点名称
  name: props.site?.name,
  // 站点主域名Key
  domain: props.site?.domain,
  // 站点地址
  url: props.site?.url,
  // 站点优先级
  pri: props.site?.pri,
  // RSS地址
  rss: props.site?.rss,
  // Cookie
  cookie: props.site?.cookie,
  // User-Agent
  ua: props.site?.ua,
  // 是否使用代理
  proxy: props.site?.proxy ? true : false,
  // 过滤规则
  filter: props.site?.filter,
  // 是否演染
  render: props.site?.render ? true : false,
  // 是否公开站点
  public: props.site?.public,
  // 备注
  note: props.site?.note,
  // 流控单位周期
  limit_interval: props.site?.limit_interval,
  // 流控次数
  limit_count: props.site?.limit_count,
  // 流控间隔
  limit_seconds: props.site?.limit_seconds,
  // 是否启用
  is_active: props.site?.is_active,
});

// 状态下拉项
const statusItems = [
  { title: "启用", value: true },
  { title: "停用", value: false },
];

// 装载时查询站点图标
onMounted(() => {
  getSiteIcon();
});
</script>

<template>
  <VCard
    :height="props.height"
    :width="props.width"
    :flat="!siteForm.is_active"
    class="overflow-hidden"
  >
    <template #image>
      <VAvatar class="absolute right-2 bottom-2" variant="flat" rounded="0">
        <VImg :src="siteIcon" />
      </VAvatar>
    </template>
    <VCardItem>
      <VCardTitle class="font-bold">{{ props.site?.name }}</VCardTitle>
      <VCardSubtitle>{{ props.site?.url }}</VCardSubtitle>
    </VCardItem>

    <div
      class="absolute top-0 right-0 flex items-center justify-between p-2"
      v-if="siteForm.is_active"
    >
      <div class="pointer-events-none z-40 flex items-center">
        <div
          class="relative inline-flex whitespace-nowrap rounded-full border-gray-700 font-semibold leading-5 ring-gray-700"
        >
          <div
            class="rounded-full bg-opacity-80 shadow-md w-5 border p-0 bg-green-500 border-green-400 ring-green-400 text-green-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clip-rule="evenodd"
              ></path>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <VCardText class="py-2">
      <VTooltip text="浏览器仿真" v-if="siteForm.render">
        <template #activator="{ props }">
          <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-apple-safari" />
        </template>
      </VTooltip>

      <VTooltip text="代理" v-if="siteForm.proxy">
        <template #activator="{ props }">
          <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-network-outline" />
        </template>
      </VTooltip>

      <VTooltip text="流控" v-if="siteForm.limit_interval">
        <template #activator="{ props }">
          <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-speedometer" />
        </template>
      </VTooltip>

      <VTooltip text="过滤" v-if="siteForm.filter">
        <template #activator="{ props }">
          <VIcon
            color="primary"
            class="me-2"
            v-bind="props"
            icon="mdi-filter-cog-outline"
          />
        </template>
      </VTooltip>
    </VCardText>

    <VCardActions>
      <VBtn
        @click="handleSiteUpdate"
        :disabled="updateButtonDisable"
        v-if="!props.site?.public"
      >
        <template #prepend>
          <VIcon icon="mdi-refresh"></VIcon>
        </template>
        {{ updateButtonText }}
      </VBtn>
      <VBtn @click="handleSiteInfo">
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
  <!-- 更新站点Cookie & UA弹窗 -->
  <VDialog v-model="siteCookieDialog" max-width="600">
    <!-- Dialog Content -->
    <VCard title="更新站点Cookie & UA">
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="6">
              <VTextField
                v-model="userPwForm.username"
                label="用户名"
                :rules="[requiredValidator]"
              />
            </VCol>
            <VCol cols="6">
              <VTextField
                v-model="userPwForm.password"
                label="密码"
                :type="isPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="
                  isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
                "
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
                :rules="[requiredValidator]"
                @keydown.enter="updateSiteCookie"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>

      <VCardActions>
        <VSpacer />
        <VBtn @click="updateSiteCookie"> 开始更新 </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <!-- 站点编辑弹窗 -->
  <VDialog v-model="siteInfoDialog" max-width="1000" persistent>
    <!-- Dialog Content -->
    <VCard :title="`编辑站点 - ${props.site?.name}`">
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="6">
              <VTextField
                v-model="siteForm.url"
                label="站点地址"
                :rules="[requiredValidator]"
              />
            </VCol>
            <VCol cols="3">
              <VSelect
                v-model="siteForm.pri"
                label="优先级"
                :items="[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]"
                :rules="[requiredValidator]"
              />
            </VCol>
            <VCol cols="3">
              <VSelect v-model="siteForm.is_active" :items="statusItems" label="状态" />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12">
              <VTextarea v-model="siteForm.cookie" label="站点Cookie" />
            </VCol>
            <VCol cols="12">
              <VTextField v-model="siteForm.ua" label="站点User-Agent" />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="4">
              <VTextField v-model="siteForm.limit_interval" label="单位周期（秒）" />
            </VCol>
            <VCol cols="4">
              <VTextField v-model="siteForm.limit_seconds" label="访问次数" />
            </VCol>
            <VCol cols="4">
              <VTextField v-model="siteForm.limit_seconds" label="访问间隔（秒）" />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="6">
              <VSwitch v-model="siteForm.proxy" label="代理" />
            </VCol>
            <VCol cols="6">
              <VSwitch v-model="siteForm.render" label="仿真" />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>

      <VCardActions>
        <VBtn @click="siteInfoDialog = false"> 取消 </VBtn>
        <VSpacer />
        <VBtn @click="updateSiteInfo"> 确定 </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
