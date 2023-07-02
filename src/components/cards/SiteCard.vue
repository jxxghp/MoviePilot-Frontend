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
const getSiteIcon = async () => {
  try {
    siteIcon.value = (await api.get("site/icon/" + props.site?.id)).data.icon;
  } catch (error) {
    console.error(error);
  }
};

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
      <VBtn>更新</VBtn>
      <VBtn>编辑</VBtn>
    </VCardActions>
  </VCard>
</template>
