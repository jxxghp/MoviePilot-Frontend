<script lang="ts" setup>
import api from "@/api";
import { Subscribe } from "@/api/types";
import { formatSeason } from "@core/utils/formatters";

// 输入参数
const props = defineProps({
  media: Object as PropType<Subscribe>,
});

// 是否显示卡片
const cardState = ref(true);

// 图片是否加载完成
const imageLoaded = ref(false);

const imageLoadHandler = () => {
  imageLoaded.value = true;
};

// 根据 type 返回不同的图标
const getIcon = () => {
  if (props.media?.type === "电影") {
    return "mdi-movie";
  } else if (props.media?.type === "电视剧") {
    return "mdi-television-classic";
  } else {
    return "mdi-help-circle";
  }
};

// 计算百分比
const getPercentage = () => {
  if (props.media?.total_episode === 0) {
    return 0;
  }
  return Math.round(
    (((props.media?.total_episode || 0) - (props.media?.lack_episode || 0)) /
      (props.media?.total_episode || 1)) *
      100
  );
};

// 删除订阅
const removeSubscribe = async () => {
  try {
    const result: { [key: string]: any } = await api.delete(
      `subscribe/${props.media?.id}`
    );
    if (result.success) {
      cardState.value = false;
    }
  } catch (e) {
    console.log(e);
  }
};

// 弹出菜单
const dropdownItems = ref([
  {
    title: "编辑",
    value: 1,
    props: {
      prependIcon: "mdi-file-edit-outline",
    },
  },
  {
    title: "取消订阅",
    value: 2,
    props: {
      prependIcon: "mdi-trash-can-outline",
      color: "error",
      click: removeSubscribe,
    },
  },
]);
</script>

<template>
  <VCard :key="props.media?.id" v-if="cardState">
    <template #image>
      <VImg
        :src="props.media?.backdrop || props.media?.poster"
        aspect-ratio="2/3"
        cover
        class="brightness-50"
        :on-load="imageLoadHandler"
      />
    </template>
    <VCardItem>
      <template #prepend>
        <VIcon size="1.9rem" :class="imageLoaded ? 'text-white':''" :icon="getIcon()" />
      </template>
      <VCardTitle :class="imageLoaded ? 'text-white':''">
        {{ props.media?.name }}
        {{ formatSeason(props.media?.season ? props.media?.season.toString() : "") }}
      </VCardTitle>
      <template #append>
        <div class="me-n3">
          <IconBtn>
            <VIcon icon="mdi-dots-vertical" />
            <VMenu activator="parent">
              <VList>
                <VListItem
                  v-for="(item, i) in dropdownItems"
                  variant="plain"
                  :base-color="item.props.color"
                  :key="i"
                  @click="item.props.click"
                >
                  <template #prepend>
                    <VIcon :icon="item.props.prependIcon"></VIcon>
                  </template>
                  <VListItemTitle v-text="item.title"></VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </IconBtn>
        </div>
      </template>
    </VCardItem>

    <VCardText>
      <p class="clamp-text mb-0"  :class="imageLoaded ? 'text-white':''">
        {{ props.media?.description }}
      </p>
    </VCardText>

    <VCardText class="d-flex justify-space-between align-center flex-wrap">
      <div class="d-flex align-center">
        <IconBtn icon="mdi-star" color="white" class="me-1" />
        <span class="text-subtitle-2 me-4" :class="imageLoaded ? 'text-white':''">{{ props.media?.vote }}</span>

        <IconBtn
          icon="mdi-progress-clock"
          color="white"
          class="me-1"
          v-if="props.media?.total_episode"
        />
        <span class="text-subtitle-2" :class="imageLoaded ? 'text-white':''" v-if="props.media?.season"
          >{{ (props.media?.total_episode || 0) - (props.media?.lack_episode || 0) }} /
          {{ props.media?.total_episode }}</span
        >
      </div>
    </VCardText>

    <VProgressLinear
      v-if="getPercentage() > 0"
      :model-value="getPercentage()"
      bg-color="success"
      color="success"
    />
  </VCard>
</template>
