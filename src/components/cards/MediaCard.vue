<script lang="ts" setup>
import { formatSeason } from "@/@core/utils/formatters";
import api from "@/api";
import { doneNProgress, startNProgress } from "@/api/nprogress";
import { MediaInfo, NotExistMediaInfo, Subscribe, TmdbSeason } from "@/api/types";
import router from "@/router";
import { useToast } from "vue-toast-notification";
// 输入参数
const props = defineProps({
  media: Object as PropType<MediaInfo>,
  width: String,
  height: String,
});

// 提示框
const $toast = useToast();

// 图片加载状态
const isImageLoaded = ref(false);

// 图片加载失败
const imageLoadError = ref(false);

// TMDB识别标志
const tmdbFlag = ref(true);

// 当前订阅状态
const isSubscribed = ref(false);

// 各季缺失状态：0-已存在 1-部分缺失 2-全部缺失
const seasonsNotExisted = ref<{ [key: number]: number }>({});

// 订阅季弹窗
const subscribeSeasonDialog = ref(false);

// 季详情
const seasonInfos = ref<TmdbSeason[]>([]);

// 订阅弹窗选择的多季
const subscribeSeasons = () => {
  subscribeSeasonDialog.value = false;
  seasonsSelected.value.forEach((season) => {
    addSubscribe(season.season_number);
  });
};

// 角标颜色
const getChipColor = (type: string) => {
  if (type === "电影") {
    return "border-blue-500 bg-blue-600";
  } else if (type === "电视剧") {
    return " bg-indigo-500 border-indigo-600";
  } else {
    return "border-purple-600 bg-purple-600";
  }
};

// 添加订阅处理
const handleAddSubscribe = async () => {
  if (props.media?.type == "电视剧" && props.media?.tmdb_id) {
    // TMDB电视剧
    // 查询TMDB所有季信息
    await getMediaSeasons();
    if (!seasonInfos.value) {
      $toast.error(`${props.media?.title} 查询剧集信息失败！`);
      return;
    }
    // 检查各季的缺失状态
    await checkSeasonsNotExists();
    if (!tmdbFlag.value) {
      return;
    }
    if (seasonInfos.value.length == 1) {
      // 只有1季
      if (!seasonsNotExisted.value[1]) {
        // 已存在
        $toast.warning(`${props.media?.title} 媒体库中已存在！`);
      } else {
        // 添加订阅
        addSubscribe();
      }
    } else {
      // 弹出季选择列表，支持多选
      subscribeSeasonDialog.value = true;
    }
  } else if (props.media?.type == "电视剧") {
    // 豆瓣电视剧，只会有一季
    let season = props.media?.season || 1;
    // 检查缺失情况
    await checkSeasonsNotExists();
    if (!tmdbFlag.value) {
      return;
    }
    if (!seasonsNotExisted.value[season]) {
      // 已存在
      $toast.warning(`${props.media?.title} 媒体库中已存在！`);
    } else {
      // 添加订阅
      addSubscribe(season);
    }
  } else {
    // 电影
    let exists = await checkMovieExists();
    if (exists) {
      $toast.warning(`${props.media?.title} 媒体库中已存在！`);
    } else {
      addSubscribe();
    }
  }
};

// 调用API添加订阅，电视剧的话需要指定季
const addSubscribe = async (season: number = 0) => {
  // 开始处理
  startNProgress();
  try {
    const result: { [key: string]: any } = await api.post("subscribe", {
      name: props.media?.title,
      type: props.media?.type,
      year: props.media?.year,
      tmdbid: props.media?.tmdb_id,
      doubanid: props.media?.douban_id,
      season: season,
    });
    // 订阅状态
    if (result.success) {
      // 订阅成功
      isSubscribed.value = true;
    }
    // 提示
    showSubscribeAddToast(
      result.success,
      props.media?.title ?? "",
      season,
      result.message
    );
  } catch (error) {
    console.error(error);
  }
  doneNProgress();
};

// 弹出添加订阅提示
const showSubscribeAddToast = (
  result: boolean,
  title: string,
  season: number,
  message: string
) => {
  if (season) {
    title = `${title} ${formatSeason(season.toString())}`;
  }
  if (result) {
    $toast.success(`${title} 添加订阅成功！`);
  } else {
    $toast.error(`${title} 添加订阅失败：${message}！`);
  }
};

// 调用API取消订阅
const removeSubscribe = async () => {
  // 开始处理
  startNProgress();
  try {
    let mediaid = props.media?.tmdb_id
      ? `tmdb:${props.media?.tmdb_id}`
      : `douban:${props.media?.douban_id}`;
    const result: { [key: string]: any } = await api.delete(
      `subscribe/media/${mediaid}`,
      {
        params: {
          season: props.media?.season,
        },
      }
    );
    if (result.success) {
      isSubscribed.value = false;
      $toast.success(`${props.media?.title} 已取消订阅！`);
    } else {
      $toast.error(`${props.media?.title} 取消订阅失败：${result.message}！`);
    }
  } catch (error) {
    console.error(error);
  }
  doneNProgress();
};

// 查询当前媒体是否已订阅
const handleCheckSubscribe = async () => {
  try {
    const result = await checkSubscribe(props.media?.season);
    if (result) {
      isSubscribed.value = true;
    }
  } catch (error) {
    console.error(error);
  }
};

// 调用API检查是否已订阅，电视剧需要指定季
const checkSubscribe = async (season: number = 0) => {
  try {
    let mediaid = props.media?.tmdb_id
      ? `tmdb:${props.media?.tmdb_id}`
      : `douban:${props.media?.douban_id}`;
    const result: Subscribe = await api.get(`subscribe/media/${mediaid}`, {
      params: {
        season: season,
      },
    });
    return result.id || null;
  } catch (error) {
    console.error(error);
  }
  return null;
};

// 检查所有季的缺失状态
const checkSeasonsNotExists = async () => {
  // 开始处理
  startNProgress();
  try {
    const result: NotExistMediaInfo[] = await api.post(`download/notexists`, props.media);
    if (result) {
      result.forEach((item) => {
        // 0-已存在 1-部分缺失 2-全部缺失
        let state = 0;
        if (item.episodes.length == 0) {
          state = 2;
        } else if (item.episodes.length < item.total_episodes) {
          state = 1;
        }
        seasonsNotExisted.value[item.season] = state;
      });
    }
  } catch (error) {
    $toast.error(`${props.media?.title}无法识别TMDB媒体信息！`);
    tmdbFlag.value = false;
  }
  // 处理完成
  doneNProgress();
};

// 检查电影是否存在
const checkMovieExists = async () => {
  try {
    const result: NotExistMediaInfo[] = await api.post(`download/notexists`, props.media);
    if (!result || result.length === 0) {
      // 没有缺失的就是存在
      return true;
    }
    return false;
  } catch (error) {
    console.error(error);
  }
};

// 查询TMDB的所有季信息
const getMediaSeasons = async () => {
  try {
    seasonInfos.value = await api.get(`tmdb/${props.media?.tmdb_id}/seasons`);
  } catch (error) {
    console.error(error);
  }
};

// 爱心订阅按钮响应
const handleSubscribe = () => {
  if (isSubscribed.value) {
    removeSubscribe();
  } else {
    handleAddSubscribe();
  }
};

// 拼装详情页链接
const getDetailLink = () => {
  let link = "";
  if (props.media?.douban_id) {
    link = `https://movie.douban.com/subject/${props.media?.douban_id}/`;
  } else if (props.media?.type === "电影") {
    link = `https://www.themoviedb.org/movie/${props.media?.tmdb_id}`;
  } else if (props.media?.type === "电视剧") {
    link = `https://www.themoviedb.org/tv/${props.media?.tmdb_id}`;
  }
  return link;
};

// 计算存在状态的颜色
const getExistColor = (season: number) => {
  let state = seasonsNotExisted.value[season];
  if (!state) {
    return "success";
  }
  if (state === 1) {
    return "warning";
  } else if (state === 2) {
    return "error";
  } else {
    return "success";
  }
};

// 计算存在状态的文本
const getExistText = (season: number) => {
  let state = seasonsNotExisted.value[season];
  if (!state) {
    return "已存在";
  }
  if (state === 1) {
    return "部分缺失";
  } else if (state === 2) {
    return "缺失";
  } else {
    return "已存在";
  }
};

// 打开详情页
const openDetailWindow = () => {
  window.open(getDetailLink(), "_blank");
};

// 开始搜索
const handleSearch = () => {
  router.push({
    path: "/resource",
    query: {
      keyword: `${
        props.media?.tmdb_id
          ? `tmdb:${props.media?.tmdb_id}`
          : `douban:${props.media?.douban_id}`
      }`,
      type: props.media?.type,
    },
  });
};

// 装载时检查是否已订阅
onBeforeMount(handleCheckSubscribe);

// 订阅季表头
const seasonsHeaders = [
  { title: "季", key: "title", sortable: false },
  { title: "集数", key: "episodes", sortable: false },
  { title: "评分", key: "vote", sortable: false },
  { title: "状态", key: "status", sortable: false },
];

// 选中的订阅季
const seasonsSelected = ref<TmdbSeason[]>([]);

// 计算图片地址
const getImgUrl = (url: string) => {
  // 如果地址中包含douban则使用中转代理
  if (url.includes("doubanio.com")) {
    return `${import.meta.env.VITE_API_BASE_URL}douban/img/${encodeURIComponent(url)}`;
  }
  return url;
};
</script>

<template>
  <VHover v-bind="props">
    <template #default="hover">
      <VCard
        v-bind="hover.props"
        :height="props.height"
        :width="props.width"
        class="outline-none shadow ring-gray-500"
        :class="{
          'transition transform-cpu duration-300 scale-105 shadow-lg': hover.isHovering,
          'ring-1': isImageLoaded,
        }"
      >
        <VImg
          aspect-ratio="2/3"
          :src="getImgUrl(props.media?.poster_path || '')"
          class="object-cover aspect-w-2 aspect-h-3"
          :class="hover.isHovering ? 'on-hover' : ''"
          @load="isImageLoaded = true"
          @error="imageLoadError = true"
          cover
        >
          <template #placeholder>
            <div class="relative animate-pulse bg-gray-300 w-full">
              <div class="w-full h-full"></div>
            </div>
          </template>
          <!-- 类型角标 -->
          <VChip
            variant="elevated"
            size="small"
            :class="getChipColor(props.media?.type || '')"
            class="absolute left-2 top-2 bg-opacity-80 shadow-md text-white font-bold"
          >
            {{ props.media?.type }}
          </VChip>
          <!-- 评分角标 -->
          <VChip
            variant="elevated"
            size="small"
            v-if="props.media?.vote_average"
            :class="getChipColor('rating')"
            class="absolute right-2 top-2 bg-opacity-80 shadow-md text-white font-bold"
          >
            {{ props.media?.vote_average }}
          </VChip>
          <!-- 详情 -->
          <VCardText
            class="w-full flex flex-col flex-wrap justify-end align-left text-white absolute bottom-0 cursor-pointer pa-2"
            v-show="hover.isHovering || imageLoadError"
            @click.stop="openDetailWindow"
          >
            <span class="font-bold">{{ props.media?.year }}</span>
            <h1
              class="mb-1 text-white font-extrabold text-xl line-clamp-2 overflow-hidden text-ellipsis ..."
            >
              {{ props.media?.title }}
            </h1>
            <p class="leading-4 line-clamp-4 overflow-hidden text-ellipsis ...">
              {{ props.media?.overview }}
            </p>
            <div class="flex align-center justify-between">
              <IconBtn icon="mdi-magnify" color="white" @click.stop="handleSearch" />
              <IconBtn
                icon="mdi-heart"
                :color="isSubscribed ? 'error' : 'white'"
                @click.stop="handleSubscribe"
              />
            </div>
          </VCardText>
        </VImg>
      </VCard>
    </template>
  </VHover>
  <VDialog
    v-model="subscribeSeasonDialog"
    max-width="600"
    content-class="whitespace-nowrap"
    scrollable
  >
    <!-- Dialog Content -->
    <VCard title="选择订阅季">
      <VCardText style="padding: 0">
        <VDataTable
          v-model="seasonsSelected"
          :headers="seasonsHeaders"
          :items="seasonInfos"
          item-value="season_number"
          return-object
          fixed-header
          show-select
          :items-per-page="100"
          density="compact"
          height="auto"
        >
          <template #item.title="{ item }">
            <span class="d-block whitespace-nowrap"
              >第 {{ item.raw.season_number }} 季
            </span></template
          >
          <template #item.episodes="{ item }">
            <VChip variant="outlined" size="small">{{ item.raw.episode_count }}</VChip>
          </template>
          <template #item.vote="{ item }">
            {{ item.raw.vote_average }}
          </template>
          <template #item.status="{ item }">
            <VChip
              :color="getExistColor(item.raw.season_number)"
              v-if="seasonsNotExisted"
              flat
              size="small"
              >{{ getExistText(item.raw.season_number) }}</VChip
            >
          </template>
          <template #no-data> 没有数据 </template>
          <template #bottom></template>
        </VDataTable>
      </VCardText>
      <VCardActions>
        <VBtn @click="subscribeSeasonDialog = false"> 取消 </VBtn>
        <VSpacer />
        <VBtn @click="subscribeSeasons" @keydown.enter="subscribeSeasons"> 确定 </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style type="scss">
.on-hover img {
  @apply brightness-50;
}
</style>
