<script lang="ts" setup>
import api from "@/api";
import { Site } from "@/api/types";
import { useToast } from "vue-toast-notification";
// 输入参数
const props = defineProps({
  site: Object as PropType<Site>,
  width: String,
  height: String,
});

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

// 更新站点Cookie UA
const updateSite = async () => {
  try {
    updateButtonText.value = "更新中 ...";
    updateButtonDisable.value = true;
    // TODO 弹窗输入用户名密码
    const result: { [key: string]: any } = await api.get(
      "site/cookie/" + props.site?.id,
      {
        params: {
          username: "",
          password: "",
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

// 装载时查询站点图标
onMounted(() => {
  getSiteIcon();
});
</script>

<template>
  <VCard
    :height="props.height"
    :width="props.width"
    :flat="!props.site?.is_active"
    class="overflow-hidden"
  >
    <template #image>
      <VAvatar class="absolute right-2 bottom-2" variant="flat" rounded="0">
        <VImg :src="siteIcon" />
      </VAvatar>
    </template>
    <VCardItem>
      <VCardTitle>{{ props.site?.name }}</VCardTitle>
      <VCardSubtitle>{{ props.site?.url }}</VCardSubtitle>
    </VCardItem>

    <VIcon
      v-if="props.site?.is_active"
      icon="mdi-check-circle"
      color="success"
      class="absolute right-2 top-2"
    >
    </VIcon>

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
      <VBtn @click="updateSite" :disabled="updateButtonDisable">{{
        updateButtonText
      }}</VBtn>
      <VBtn>编辑</VBtn>
      <VBtn @click="testSite" :disabled="testButtonDisable">{{ testButtonText }}</VBtn>
    </VCardActions>
  </VCard>
</template>
