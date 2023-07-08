<script lang="ts" setup>
import { calculateTimeDifference } from "@/@core/utils";
import { formatSeason } from "@/@core/utils/formatters";
import { numberValidator } from "@/@validators";
import api from "@/api";
import { Subscribe } from "@/api/types";
import { useToast } from "vue-toast-notification";

// 输入参数
const props = defineProps({
  media: Object as PropType<Subscribe>,
});

// 提示框
const $toast = useToast();

// 是否显示卡片
const cardState = ref(true);

// 图片是否加载完成
const imageLoaded = ref(false);

// 订阅弹窗
const subscribeInfoDialog = ref(false);

// 上一次更新时间
const lastUpdateText = ref(
  `${
    props.media?.last_update
      ? `${calculateTimeDifference(props.media?.last_update || "")}前`
      : ""
  }`
);

// 图片加载完成响应
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

// 计算文本颜色
const getTextColor = () => {
  return imageLoaded.value ? "white" : "";
};

// 计算文本类
const getTextClass = () => {
  return imageLoaded.value ? "text-white" : "";
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

// 搜索订阅
const searchSubscribe = async () => {
  try {
    const result: { [key: string]: any } = await api.get(
      `subscribe/search/${props.media?.id}`
    );
    // 提示
    if (result.success) {
      $toast.success(`${props.media?.name} 提交搜索请求成功！`);
    }
  } catch (e) {
    console.log(e);
  }
};

// 调用API修改订阅
const updateSubscribeInfo = async () => {
  subscribeInfoDialog.value = false;
  try {
    const result: { [key: string]: any } = await api.put(`subscribe`, subscribeForm);
    // 提示
    if (result.success) {
      $toast.success(`${props.media?.name} 更新成功！`);
    } else {
      $toast.error(`${props.media?.name} 更新失败：${result.message}！`);
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
      click: () => {
        subscribeInfoDialog.value = true;
      },
    },
  },
  {
    title: "搜索",
    value: 2,
    props: {
      prependIcon: "mdi-magnify",
      click: searchSubscribe,
    },
  },
  {
    title: "取消订阅",
    value: 3,
    props: {
      prependIcon: "mdi-trash-can-outline",
      color: "error",
      click: removeSubscribe,
    },
  },
]);

// 订阅编辑表单
const subscribeForm = reactive({
  id: props.media?.id,
  // 搜索关键字
  keyword: props.media?.keyword,
  // 过滤规则
  filter: props.media?.filter,
  // 包含
  include: props.media?.include,
  // 排除
  exclude: props.media?.exclude,
  // 总集数
  total_episode: props.media?.total_episode,
  // 开始集数
  start_episode: props.media?.start_episode,
});
</script>

<template>
  <VCard :key="props.media?.id" v-if="cardState" @click="subscribeInfoDialog = true">
    <template #image>
      <VImg
        :src="props.media?.backdrop || props.media?.poster"
        aspect-ratio="2/3"
        cover
        class="brightness-50"
        @load="imageLoadHandler"
      />
    </template>
    <VCardItem>
      <template #prepend>
        <VIcon size="1.9rem" :color="getTextColor()" :icon="getIcon()" />
      </template>
      <VCardTitle :class="getTextClass()">
        {{ props.media?.name }}
        {{ formatSeason(props.media?.season ? props.media?.season.toString() : "") }}
      </VCardTitle>
      <template #append>
        <div class="me-n3">
          <IconBtn>
            <VIcon icon="mdi-dots-vertical" :color="getTextColor()" />
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
      <p class="clamp-text mb-0" :class="getTextClass()">
        {{ props.media?.description }}
      </p>
    </VCardText>

    <VCardText class="d-flex justify-space-between align-center flex-wrap">
      <div class="d-flex align-center">
        <IconBtn icon="mdi-star" :color="getTextColor()" class="me-1" />
        <span class="text-subtitle-2 me-4" :class="getTextClass()">{{
          props.media?.vote
        }}</span>
        <IconBtn
          v-bind="props"
          icon="mdi-progress-clock"
          :color="getTextColor()"
          class="me-1"
          v-if="props.media?.total_episode"
        />
        <span
          class="text-subtitle-2 me-4"
          :class="getTextClass()"
          v-if="props.media?.season"
          >{{ (props.media?.total_episode || 0) - (props.media?.lack_episode || 0) }} /
          {{ props.media?.total_episode }}</span
        >
        <IconBtn
          icon="mdi-account"
          :color="getTextColor()"
          class="me-1"
          v-if="props.media?.username"
        />
        <span
          class="text-subtitle-2 me-4"
          :class="getTextClass()"
          v-if="props.media?.username"
        >
          {{ props.media?.username }}
        </span>
      </div>
    </VCardText>
    <VCardText
      class="absolute right-0 bottom-0 d-flex align-center p-2 text-gray-300"
      v-if="lastUpdateText"
    >
      <VIcon icon="mdi-download" class="me-1" /> {{ lastUpdateText }}
    </VCardText>
    <VProgressLinear
      v-if="getPercentage() > 0"
      :model-value="getPercentage()"
      bg-color="success"
      color="success"
    />
  </VCard>
  <!-- 订阅编辑弹窗 -->
  <VDialog v-model="subscribeInfoDialog" max-width="1000" persistent>
    <!-- Dialog Content -->
    <VCard :title="`编辑订阅 - ${props.media?.name}`">
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12" md="6">
              <VTextField v-model="subscribeForm.keyword" label="搜索关键词" />
            </VCol>
            <VCol cols="12" md="3" v-if="props.media?.type == '电视剧'">
              <VTextField
                v-model="subscribeForm.total_episode"
                label="总集数"
                :rules="[numberValidator]"
              />
            </VCol>
            <VCol cols="12" md="3" v-if="props.media?.type == '电视剧'">
              <VTextField
                v-model="subscribeForm.start_episode"
                label="开始集数"
                :rules="[numberValidator]"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="subscribeForm.include"
                label="包含（关键字、正则式）"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="subscribeForm.exclude"
                label="排除（关键字、正则式）"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>

      <VCardActions>
        <VBtn @click="subscribeInfoDialog = false"> 取消 </VBtn>
        <VSpacer />
        <VBtn @click="updateSubscribeInfo"> 确定 </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
