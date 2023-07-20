<script lang="ts" setup>
import api from "@/api";
import { Plugin } from "@/api/types";
import { useToast } from "vue-toast-notification";

// 定义触发的自定义事件
const emit = defineEmits(["remove"]);

// 提示框
const $toast = useToast();

// 输入参数
const props = defineProps({
  plugin: Object as PropType<Plugin>,
  width: String,
  height: String,
});

// 本身是否可见
const isVisible = ref(true);

// 卸载插件
const uninstallPlugin = async () => {
  try {
    const result: { [key: string]: any } = await api.delete(`plugin/${props.plugin?.id}`);
    if (result.success) {
      $toast.success(`插件 ${props.plugin?.plugin_name} 已卸载`);
      // 通知父组件刷新
      emit("remove");
    } else {
      $toast.error(`插件 ${props.plugin?.plugin_name} 卸载失败：${result.message}}`);
    }
  } catch (error) {
    console.error(error);
  }
};

// 显示插件详情
const showPluginInfo = () => {};

// 弹出菜单
const dropdownItems = ref([
  {
    title: "卸载",
    value: 1,
    props: {
      prependIcon: "mdi-trash-can-outline",
      color: "error",
      click: uninstallPlugin,
    },
  },
]);
</script>
<template>
  <VCard
    :width="props.width"
    :height="props.height"
    @click="showPluginInfo"
    v-if="isVisible"
  >
    <div
      class="relative pa-4 text-center card-cover-blurred"
      :style="{ background: `${props.plugin?.plugin_color}` }"
    >
      <div class="me-n3 absolute top-0 right-3">
        <IconBtn>
          <VIcon icon="mdi-dots-vertical" />
          <VMenu activator="parent" close-on-content-click>
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
      <VAvatar size="128" class="shadow">
        <VImg :src="`/plugin/${props.plugin?.plugin_icon}`" aspect-ratio="4/3" cover />
      </VAvatar>
    </div>
    <VCardItem class="py-2">
      <VCardTitle>{{ props.plugin?.plugin_name }}</VCardTitle>
    </VCardItem>
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
