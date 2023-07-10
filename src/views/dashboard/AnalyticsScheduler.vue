<script setup lang="ts">
import api from "@/api";
import { ScheduleInfo } from "@/api/types";
const salesByCountries = [
  {
    abbr: "站",
    amount: "CookieCloud同步",
    country: "2小时5分钟后",
    sales: "等待",
    color: "success",
  },
  {
    abbr: "订",
    amount: "订阅刷新",
    country: "30分钟后",
    sales: "运行中",
    color: "error",
  },
  {
    abbr: "搜",
    amount: "订阅搜索",
    country: "12小时后",
    sales: "等待",
    color: "error",
  },
  {
    abbr: "豆",
    amount: "豆瓣想看同步",
    country: "25分钟后",
    sales: "运行中",
    color: "warning",
  },
  {
    abbr: "整",
    amount: "下载文件整理",
    country: "每隔5分钟",
    sales: "等待",
    color: "secondary",
  },
];

// 定时服务列表
const schedulerList = ref<ScheduleInfo[]>([]);

// 调用API加载定时服务列表
const loadSchedulerList = async () => {
  try {
    const res: ScheduleInfo[] = await api.get("dashboard/schedule");
    schedulerList.value = res;
  } catch (e) {
    console.log(e);
  }
};

onMounted(() => {
  loadSchedulerList();
});
</script>

<template>
  <VCard>
    <VCardItem>
      <VCardTitle>后台任务</VCardTitle>
    </VCardItem>

    <VCardText>
      <VList class="card-list">
        <VListItem v-for="item in schedulerList" :key="item.id">
          <template #prepend>
            <VAvatar size="40" variant="tonal" color="" class="me-3">
              {{ item.name[0] }}
            </VAvatar>
          </template>

          <VListItemTitle class="mb-1">
            <span class="text-sm font-weight-medium">{{ item.name }}</span>
          </VListItemTitle>

          <VListItemSubtitle class="text-xs"> {{ item.next_run }}</VListItemSubtitle>

          <template #append>
            <div>
              <h4 class="font-weight-medium">
                {{ item.status }}
              </h4>
            </div>
          </template>
        </VListItem>
      </VList>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.card-list {
  --v-card-list-gap: 1.5rem;
}
</style>
