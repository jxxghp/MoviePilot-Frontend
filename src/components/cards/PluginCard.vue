<script lang="ts" setup>
import { Plugin } from "@/api/types";

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  width: String,
  height: String,
});

// 显示插件详情
const showPluginInfo = () => {};
</script>
<template>
  <VCard :width="props.width" :height="props.height" @click="showPluginInfo">
    <div
      :class="`relative pa-4 text-center card-cover-blurred`"
      :style="{ background: `${props.plugin?.plugin_color}` }"
    >
      <VAvatar size="128" class="shadow">
        <VImg
          :src="`/src/assets/images/plugin/${props.plugin?.plugin_icon}`"
          aspect-ratio="4/3"
          cover
        />
      </VAvatar>
    </div>
    <VCardTitle>{{ props.plugin?.plugin_name }}</VCardTitle>

    <VCardText>
      {{ props.plugin?.plugin_desc }}
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
