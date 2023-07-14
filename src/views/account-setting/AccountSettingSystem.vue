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

// 种子优先规则下拉框
const TorrentPriorityItems = [
  { title: "站点优先", value: "site" },
  { title: "做种数优先", value: "seeder" },
];

// 种子优先规则
const selectedTorrentPriority = ref<string>("seeder");

// 查询所有站点
const querySites = async () => {
  try {
    const data: Site[] = await api.get("site");
    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter((item) => item.is_active);
    querySelectedSites();
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

// 查询种子优先规则
const queryTorrentPriority = async () => {
  try {
    const result: { [key: string]: any } = await api.get(
      "system/setting/TorrentsPriority"
    );
    selectedTorrentPriority.value = result.data?.value;
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

// 保存种子优先规则
const saveTorrentPriority = async () => {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post(
      "system/setting/TorrentsPriority",
      selectedTorrentPriority.value
    );
    if (result.success) {
      $toast.success("优先规则保存成功");
    } else {
      $toast.error("优先规则保存失败！");
    }
  } catch (error) {
    console.log(error);
  }
};

onMounted(() => {
  querySites();
  queryTorrentPriority();
});
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="索引站点">
        <VCardSubtitle> 只有选中的站点才会在搜索和订阅中使用 </VCardSubtitle>

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
    </VCol>
    <VCol cols="12">
      <VCard title="优先规则">
        <VCardText>
          <VSelect
            v-model="selectedTorrentPriority"
            :items="TorrentPriorityItems"
            label="下载优先规则"
            outlined
          ></VSelect>
        </VCardText>
        <VCardItem>
          <VBtn type="submit" @click="saveTorrentPriority"> 保存 </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
  </VRow>
</template>
