<script setup lang="ts">
import api from "@/api";
import type { TransferHistory } from "@/api/types";
import { onMounted, ref } from "vue";

// 表头
const headers = [
  { title: "标题", key: "title" },
  { title: "目录", key: "src"},
  { title: "转移方式", key: "mode"},
  { title: "时间", key: "date"},
  { title: "状态", key: "status"},
  { title: "失败原因", key: "errmsg"},
  { title: "", key: "actions", sortable: false},
];

// 数据列表
const dataList = ref<TransferHistory[]>([]);

// 获取订阅列表数据
const fetchData = async () => {
  try {
    dataList.value = await api.get("history/transfer");
  } catch (error) {
    console.error(error);
  }
};

// 根据 type 返回不同的图标
const getIcon = (type: string) => {
  if (type === "电影") {
    return "mdi-movie";
  } else if (type === "电视剧") {
    return "mdi-television-classic";
  } else {
    return "mdi-help-circle";
  }
};

// 计算颜色
const getStatusColor = (status: boolean) => {
  return status ? 'success' : 'error';
};

// 加载时获取数据
onMounted(fetchData);

</script>

<template>
  <VCard title="历史记录" class="pb-5">
    <VDataTable 
      :headers="headers" 
      :items="dataList"
      fixed-header
      show-select
      :items-per-page="25"
      items-per-page-text="每页条数"
      page-text="{0}-{1} 共 {2} 条"
    >
      <template #item.title="{ item }">
        <div class="d-flex">
          <VAvatar><VIcon :icon="getIcon(item.raw.type || '')"></VIcon></VAvatar>
          <div class="d-flex flex-column ms-1 text-high-emphasis">
            <span class="d-block">
              {{ item.raw.title }} {{ item.raw.seasons }}{{ item.raw.episodes }}
            </span>
            <small>{{ item.raw.category }}</small>
          </div>
        </div>
      </template>
      <template #item.src="{ item }">
        <small>{{ item.raw.src }} <br>=> {{ item.raw.dest }}</small>
      </template>
      <template #item.mode="{ item }">
        <VChip variant="outlined" color="primary" size="small">{{ item.raw.mode }}</VChip>
      </template>
      <template #item.status="{ item }">
        <VChip :color="getStatusColor(item.raw.status)" size="small">
          {{ item.raw.status ? '成功' : '失败' }}
        </VChip>
      </template>
      <template #item.date="{ item }">
        <small>{{ item.raw.date }}</small>
      </template>
      <template #item.errmsg="{ item }">
        {{ item.raw.errmsg }}
      </template>
      <template #item.actions="{ item }">
        <MoreBtn />
      </template>
      <template #no-data>
        没有数据
      </template>
    </VDataTable>
  </VCard>
</template>

<style type="scss">
.v-table th {
  white-space: nowrap;
}
</style>
