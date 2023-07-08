<script lang="ts" setup>
import api from "@/api";
import { Context } from "@/api/types";

// 输入参数
const props = defineProps({
  torrent: Object as PropType<Context>,
  width: String,
  height: String,
});

// 种子信息
const torrent = ref(props.torrent?.torrent_info);
// 媒体信息
const media = ref(props.torrent?.media_info);
// 识别元数据
const meta = ref(props.torrent?.meta_info);

// 站点图标
const siteIcon = ref("");

// 查询站点图标
const getSiteIcon = async () => {
  try {
    siteIcon.value = (await api.get("site/icon/" + torrent?.value?.site)).data.icon;
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
  <VCard :width="props.width" :height="props.height">
    <template #image>
      <VAvatar class="absolute right-2 bottom-2" variant="flat" rounded="0">
        <VImg :src="siteIcon" />
      </VAvatar>
    </template>
    <VCardTitle>
      {{ media?.title }} {{ meta?.season_episode }}
      <span class="text-green-700 ms-2 text-sm">↑{{ torrent?.seeders }}</span>
      <span class="text-orange-700 ms-2 text-sm">↓{{ torrent?.peers }}</span>
    </VCardTitle>
    <VCardText>
      {{ torrent?.title }}
    </VCardText>
    <VCardText>{{ torrent?.description }}</VCardText>
    <VCardItem class="pb-3 pt-0" v-if="torrent?.labels">
      <VChip
        variant="elevated"
        size="small"
        v-for="label in torrent?.labels"
        color="primary"
        >{{ label }}</VChip
      >
    </VCardItem>
  </VCard>
</template>
