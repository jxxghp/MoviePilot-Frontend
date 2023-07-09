<script lang="ts" setup>
import api from "@/api";
import { Site } from "@/api/types";
import { useToast } from "vue-toast-notification";

// 提示框
const $toast = useToast();

// 选中站点
const selectedSites = ref<number[]>([]);

// 所有站点
const allSites = ref<Site[]>([]);

// 查询所有站点
const querySites = async () => {
  try {
    const data: Site[] = await api.get("site");
    allSites.value = data;
  } catch (error) {
    console.log(error);
  }
};

// 查询用户选中的站点
const querySelectedSites = async () => {
  try {
    const result: { [key: string]: any } = await api.get("system/setting/IndexerSites");
    selectedSites.value = result.data?.value;
  } catch (error) {
    console.log(error);
  }
};

// 保存用户选中的站点
const saveSelectedSites = async () => {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post(
      "system/setting/IndexerSites",
      selectedSites.value
    );
    if (result.success) {
      $toast.success("索引站点保存成功");
    } else {
      $toast.error("索引站点保存失败！");
    }
  } catch (error) {
    console.log(error);
  }
};

onMounted(() => {
  querySites();
  querySelectedSites();
});
</script>

<template>
  <VCard title="索引站点">
    <VCardSubtitle> 只有选中的站点才会在搜索中使用 </VCardSubtitle>

    <VCardItem>
      <VChipGroup v-model="selectedSites" column multiple>
        <VChip
          filter
          variant="outlined"
          v-for="site in allSites"
          :key="site.id"
          :value="site.id"
        >
          {{ site.name }}
        </VChip>
      </VChipGroup>
    </VCardItem>

    <VCardItem>
      <VBtn type="submit" @click="saveSelectedSites"> 保存 </VBtn>
    </VCardItem>
  </VCard>
</template>
