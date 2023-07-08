<script lang="ts" setup>
import api from "@/api";
import { Context } from "@/api/types";
import { useToast } from "vue-toast-notification";
import { useConfirm } from "vuetify-use-dialog";

// 输入参数
const props = defineProps({
  torrent: Object as PropType<Context>,
  width: String,
  height: String,
});

// 提示框
const $toast = useToast();

// 确认框
const createConfirm = useConfirm();

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

// 询问并添加下载
const handleAddDownload = async () => {
  const isConfirmed = await createConfirm({
    title: "确认",
    content: `是否确认下载 ${torrent.value?.title} ?`,
    confirmationText: "确认",
    cancellationText: "取消",
    dialogProps: {
      maxWidth: 600,
    },
  });

  if (!isConfirmed) return;

  addDownload();
};

// 添加下载
const addDownload = async () => {
  try {
    const result: { [key: string]: any } = await api.post("download", {
      media_in: media?.value,
      torrent_in: torrent?.value,
    });
    if (result.success) {
      // 添加下载成功
      $toast.success(
        `${torrent.value?.site_name} ${torrent.value?.title} 添加下载成功！`
      );
    } else {
      console.log(`添加下载失败：${result.message}`);
    }
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
  <VCard :width="props.width" :height="props.height" @click="handleAddDownload">
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
        class="me-1 mb-1"
        >{{ label }}</VChip
      >
      <VChip
        v-if="meta?.resource_type"
        variant="elevated"
        size="small"
        color="error"
        class="me-1 mb-1"
      >
        {{ meta?.resource_type }}</VChip
      >
      <VChip
        v-if="meta?.resource_pix"
        variant="elevated"
        size="small"
        color="error"
        class="me-1 mb-1"
      >
        {{ meta?.resource_pix }}
      </VChip>
      <VChip
        v-if="meta?.video_encode"
        variant="elevated"
        size="small"
        color="warning"
        class="me-1 mb-1"
      >
        {{ meta?.video_encode }}
      </VChip>
      <VChip
        v-if="meta?.resource_team"
        variant="elevated"
        size="small"
        color="info"
        class="me-1 mb-1"
      >
        {{ meta?.resource_team }}
      </VChip>
      <VChip
        v-if="torrent?.volume_factor"
        variant="elevated"
        size="small"
        color="success"
        class="me-1 mb-1"
      >
        {{ torrent?.volume_factor }}
      </VChip>
    </VCardItem>
  </VCard>
</template>
