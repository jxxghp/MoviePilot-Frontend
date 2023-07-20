<script lang="ts" setup>
import api from "@/api";
import { Plugin } from "@/api/types";
import { useToast } from "vue-toast-notification";

// 定义触发的自定义事件
const emit = defineEmits(["install"]);

// 提示框
const $toast = useToast();

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  width: String,
  height: String,
});

// 安装插件
const installPlugin = async () => {
  try {
    const result: { [key: string]: any } = await api.get(
      `plugin/install/${props.plugin?.id}`
    );
    if (result.success) {
      $toast.success(`插件 ${props.plugin?.plugin_name} 安装成功！`);
      // 通知父组件刷新
      emit("install");
    } else {
      $toast.error(`插件 ${props.plugin?.plugin_name} 安装失败：${result.message}}`);
    }
  } catch (error) {
    console.error(error);
  }
};
</script>
<template>
  <VCard :width="props.width" :height="props.height" @click="installPlugin">
    <div
      class="relative pa-4 text-center card-cover-blurred"
      :style="{ background: `${props.plugin?.plugin_color}` }"
    >
      <VAvatar size="128" class="shadow">
        <VImg :src="`/plugin/${props.plugin?.plugin_icon}`" aspect-ratio="4/3" cover />
      </VAvatar>
    </div>
    <VCardTitle>{{ props.plugin?.plugin_name }}</VCardTitle>

    <VCardText>
      {{ props.plugin?.plugin_desc }}
    </VCardText>
    <VCardText>
      作者：<a :href="props.plugin?.author_url" target="_blank" @click.stop>
        {{ props.plugin?.plugin_author }}
      </a>
    </VCardText>
  </VCard>
</template>
<style type="scss" scoped>
.card-cover-blurred::before {
  position: absolute;
  /* stylelint-disable-next-line property-no-vendor-prefix */
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  background: rgba(29, 39, 59, 48%);
  content: "";
  inset: 0;
}
</style>
