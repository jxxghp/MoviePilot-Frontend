<script setup lang="ts">
const salesByCountries = [
  {
    abbr: "CC",
    amount: "CookieCloud同步",
    country: "2小时5分钟后",
    sales: "等待",
    color: "success",
  },
  {
    abbr: "刷",
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
    abbr: "下",
    amount: "下载文件整理",
    country: "每隔5分钟",
    sales: "等待",
    color: "secondary",
  },
];
</script>

<template>
  <VCard>
    <VCardItem>
      <VCardTitle>后台任务</VCardTitle>
    </VCardItem>

    <VCardText>
      <VList class="card-list">
        <VListItem v-for="data in salesByCountries" :key="data.country">
          <template #prepend>
            <VAvatar size="40" variant="tonal" :color="data.color" class="me-3">
              {{ data.abbr }}
            </VAvatar>
          </template>

          <VListItemTitle class="mb-1">
            <span class="text-sm font-weight-medium">{{ data.amount }}</span>
          </VListItemTitle>

          <VListItemSubtitle class="text-xs">
            {{ data.country }}
          </VListItemSubtitle>

          <template #append>
            <div>
              <h4 class="font-weight-medium">
                {{ data.sales }}
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
