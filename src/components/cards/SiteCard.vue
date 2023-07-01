<script lang="ts" setup>
import api from "@/api";
import { Site } from "@/api/types";
// 输入参数
const props = defineProps({
  site: Object as PropType<Site>,
  width: String,
  height: String,
});

// 图标
const siteIcon = ref<string>("");

// 查询站点图标
const getSiteIcon = async (siteid: number) => {
  try {
    siteIcon.value = (await api.get("site/icon/" + siteid)).data.icon;
  } catch (error) {
    console.error(error);
  }
};

onMounted(() => {
  getSiteIcon(props.site?.id ?? 0);
});
</script>

<template>
  <VCard :height="props.height" :width="props.width">
    <VCardItem>
      <VCardTitle>{{ props.site?.name }}</VCardTitle>
      <VCardSubtitle>{{ props.site?.url }}</VCardSubtitle>
    </VCardItem>

    <VIcon
      v-if="props.site?.is_active"
      icon="mdi-check-circle-outline"
      color="success"
      size="32"
      class="absolute right-2 top-2 bg-opacity-80 text-white font-bold"
    >
    </VIcon>

    <VAvatar class="absolute right-5 bottom-5">
      <VImg :src="siteIcon"></VImg>
    </VAvatar>

    <VCardText class="py-2">
      <VTooltip text="浏览器仿真">
        <template #activator="{ props }">
          <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-apple-safari" />
        </template>
      </VTooltip>

      <VTooltip text="代理">
        <template #activator="{ props }">
          <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-network-outline" />
        </template>
      </VTooltip>

      <VTooltip text="流控">
        <template #activator="{ props }">
          <VIcon color="primary" class="me-2" v-bind="props" icon="mdi-speedometer" />
        </template>
      </VTooltip>

      <VTooltip text="过滤">
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
      <VBtn>更新</VBtn>
      <VBtn>编辑</VBtn>
    </VCardActions>
  </VCard>
</template>
