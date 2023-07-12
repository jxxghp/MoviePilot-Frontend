<script lang="ts" setup>
import { formatFileSize } from "@/@core/utils/formatters";
import api from "@/api";
import { doneNProgress, startNProgress } from "@/api/nprogress";
import { Context } from "@/api/types";
import { useToast } from "vue-toast-notification";
import { useConfirm } from "vuetify-use-dialog";

// 输入参数
const props = defineProps({
  torrent: Object as PropType<Context>,
  more: Array as PropType<Context[]>,
  width: String,
  height: String,
});

// 提示框
const $toast = useToast();

// 确认框
const createConfirm = useConfirm();

// 更多来源界面
const showMoreTorrents = ref(false);

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
const handleAddDownload = async (
  _site: any = undefined,
  _media: any = undefined,
  _torrent: any = undefined
) => {
  if (!_media || !_torrent || !_site) {
    _site = torrent.value?.site_name;
    _media = media.value;
    _torrent = torrent.value;
  }
  const isConfirmed = await createConfirm({
    title: "确认",
    content: `是否确认下载【${_site}】${_torrent?.title} ?`,
    confirmationText: "确认",
    cancellationText: "取消",
    dialogProps: {
      maxWidth: 600,
    },
  });

  if (!isConfirmed) return;

  addDownload(_media, _torrent);
};

// 添加下载
const addDownload = async (_media: any, _torrent: any) => {
  startNProgress();
  try {
    const result: { [key: string]: any } = await api.post("download", {
      media_in: _media,
      torrent_in: _torrent,
    });
    if (result.success) {
      // 添加下载成功
      $toast.success(`${_torrent?.site_name} ${_torrent?.title} 添加下载成功！`);
    } else {
      // 添加下载失败
      $toast.error(`${_torrent?.site_name} ${_torrent?.title} 添加下载失败！`);
    }
  } catch (error) {
    console.error(error);
  }
  doneNProgress();
};

// 打开种子详情页面
const openTorrentDetail = () => {
  window.open(torrent.value?.page_url, "_blank");
};

// 下载种子文件
const downloadTorrentFile = async () => {
  window.open(torrent.value?.enclosure, "_blank");
};

// 促销Chip颜色
const getVolumeFactorColor = (downloadVolume: number, uploadVolume: number) => {
  if (downloadVolume === 0) {
    return "text-white bg-lime-500";
  } else if (downloadVolume < 1) {
    return "text-white bg-green-500";
  } else if (uploadVolume != 1) {
    return "text-white bg-sky-500";
  } else {
    return "text-white bg-gray-500";
  }
};

// 装载时查询站点图标
onMounted(() => {
  getSiteIcon();
});
</script>
<template>
  <VCard :width="props.width" :height="props.height" @click="handleAddDownload">
    <template #image v-if="!showMoreTorrents">
      <VAvatar class="absolute right-2 bottom-2" variant="flat" rounded="0">
        <VImg :src="siteIcon" />
      </VAvatar>
    </template>
    <VCardItem class="py-1">
      <VCardTitle>
        {{ media?.title }} {{ meta?.season_episode }}
        <span class="text-green-700 ms-2 text-sm">↑{{ torrent?.seeders }}</span>
        <span class="text-orange-700 ms-2 text-sm">↓{{ torrent?.peers }}</span>
      </VCardTitle>
      <template #append>
        <div class="me-n3">
          <IconBtn>
            <VIcon icon="mdi-dots-vertical" color="white" />
            <VMenu activator="parent" close-on-content-click>
              <VList>
                <VListItem variant="plain" @click="openTorrentDetail">
                  <template #prepend>
                    <VIcon icon="mdi-information"></VIcon>
                  </template>
                  <VListItemTitle>查看详情</VListItemTitle>
                </VListItem>
                <VListItem variant="plain" @click="downloadTorrentFile">
                  <template #prepend>
                    <VIcon icon="mdi-download"></VIcon>
                  </template>
                  <VListItemTitle>下载种子</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </IconBtn>
        </div>
      </template>
    </VCardItem>
    <VCardText class="text-subtitle-2">
      {{ torrent?.title }}
    </VCardText>
    <VCardText>{{ torrent?.description }}</VCardText>
    <VCardItem class="pb-3 pt-0 pe-12" v-if="torrent?.labels">
      <VChip
        variant="elevated"
        size="small"
        v-for="label in torrent?.labels"
        color="primary"
        class="me-1 mb-1"
        >{{ label }}</VChip
      >
      <VChip
        v-if="meta?.edition"
        variant="elevated"
        size="small"
        class="me-1 mb-1 text-white bg-red-500"
      >
        {{ meta?.edition }}</VChip
      >
      <VChip
        v-if="meta?.resource_pix"
        variant="elevated"
        size="small"
        class="me-1 mb-1 text-white bg-red-500"
      >
        {{ meta?.resource_pix }}
      </VChip>
      <VChip
        v-if="meta?.video_encode"
        variant="elevated"
        size="small"
        class="me-1 mb-1 text-white bg-orange-500"
      >
        {{ meta?.video_encode }}
      </VChip>
      <VChip
        v-if="torrent?.size"
        variant="elevated"
        size="small"
        class="me-1 mb-1 text-white bg-yellow-500"
      >
        {{ formatFileSize(torrent?.size) }}
      </VChip>
      <VChip
        v-if="meta?.resource_team"
        variant="elevated"
        size="small"
        class="me-1 mb-1 text-white bg-cyan-500"
      >
        {{ meta?.resource_team }}
      </VChip>
      <VChip
        v-if="torrent?.downloadvolumefactor !== 1 || torrent?.uploadvolumefactor !== 1"
        :class="
          getVolumeFactorColor(torrent?.downloadvolumefactor, torrent?.uploadvolumefactor)
        "
        variant="elevated"
        size="small"
        class="me-1 mb-1"
      >
        {{ torrent?.volume_factor }}
      </VChip>
    </VCardItem>
    <VCardActions>
      <VBtn
        @click.stop="showMoreTorrents = !showMoreTorrents"
        v-if="props.more && props.more.length > 0"
      >
        <template #append>
          <VIcon :icon="showMoreTorrents ? 'mdi-chevron-up' : 'mdi-chevron-down'"></VIcon>
        </template>
        更多来源
      </VBtn>
    </VCardActions>
    <VExpandTransition>
      <div v-show="showMoreTorrents">
        <VDivider></VDivider>
        <VChipGroup class="p-3">
          <VChip
            v-for="item in props.more"
            @click.stop="
              handleAddDownload(
                item.torrent_info?.site_name,
                item.media_info,
                item.torrent_info
              )
            "
            >{{ item.torrent_info.site_name }}</VChip
          >
        </VChipGroup>
      </div>
    </VExpandTransition>
  </VCard>
</template>
