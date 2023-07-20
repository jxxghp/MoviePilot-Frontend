<script lang="ts" setup>
import api from "@/api";
import { Plugin } from "@/api/types";
import NoDataFound from "@/components/NoDataFound.vue";
import PluginAppCard from "@/components/cards/PluginAppCard.vue";
import PluginCard from "@/components/cards/PluginCard.vue";

// 数据列表
const dataList = ref<Plugin[]>([]);

// 是否刷新过
const isRefreshed = ref(false);

// APP市场窗口
const PluginAppDialog = ref(false);

// 获取已安装的插件列表
const getInstalledPluginList = computed(() => {
  return dataList.value.filter((item) => item.installed);
});

// 获取未安装的插件列表
const getUninstalledPluginList = computed(() => {
  return dataList.value.filter((item) => !item.installed);
});

// 关闭插件市场窗口
const pluginDialogClose = () => {
  PluginAppDialog.value = false;
};

// 新安装了插件
const pluginInstalled = () => {
  fetchData();
  pluginDialogClose();
};

// 获取插件列表数据
const fetchData = async () => {
  try {
    dataList.value = await api.get("plugin");
    isRefreshed.value = true;
  } catch (error) {
    console.error(error);
  }
};

// 加载时获取数据
onBeforeMount(fetchData);
</script>

<template>
  <VProgressCircular
    class="centered"
    v-if="!isRefreshed"
    indeterminate
    color="primary"
  ></VProgressCircular>
  <div class="grid gap-3 grid-plugin-card" v-if="dataList.length > 0">
    <PluginCard
      v-for="data in getInstalledPluginList"
      :key="data.id"
      :plugin="data"
      @remove="fetchData"
    />
  </div>
  <NoDataFound
    v-if="getInstalledPluginList.length === 0 && isRefreshed"
    error-code="404"
    error-title="没有安装插件"
    error-description="点击右下角按钮，前往插件市场安装插件。"
  >
  </NoDataFound>
  <!-- App市场 -->
  <VDialog
    v-model="PluginAppDialog"
    fullscreen
    :scrim="false"
    transition="dialog-bottom-transition"
  >
    <!-- Dialog Activator -->
    <template #activator="{ props }">
      <VBtn icon="mdi-plus" v-bind="props" size="x-large" class="fixed right-5 bottom-5">
      </VBtn>
    </template>

    <!-- Dialog Content -->
    <VCard>
      <!-- Toolbar -->
      <div>
        <VToolbar color="primary">
          <VToolbarTitle>插件市场</VToolbarTitle>

          <VSpacer />

          <VToolbarItems>
            <VBtn size="x-large" @click="pluginDialogClose">
              <VIcon color="white" icon="mdi-close" />
            </VBtn>
          </VToolbarItems>
        </VToolbar>
      </div>
      <div class="pa-4">
        <div class="grid gap-3 grid-plugin-card">
          <PluginAppCard
            v-for="data in getUninstalledPluginList"
            :key="data.id"
            :plugin="data"
            @install="pluginInstalled"
          />
        </div>
        <NoDataFound
          v-if="getUninstalledPluginList.length === 0 && isRefreshed"
          error-code="404"
          error-title="没有未安装插件"
          error-description="所有可用插件均已安装。"
        >
        </NoDataFound>
      </div>
    </VCard>
  </VDialog>
</template>

<style type="scss">
.grid-plugin-card {
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  padding-block-end: 1rem;
}

dialog-bottom-transition-enter-active,
.dialog-bottom-transition-leave-active {
  transition: transform 0.2s ease-in-out;
}
</style>
