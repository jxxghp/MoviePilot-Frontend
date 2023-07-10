<script setup lang="ts">
const earnings = [
  {
    avatar: "mdi-upload",
    title: "总上传量",
    amount: "193 GB",
  },
  {
    avatar: "mdi-download",
    title: "总下载量",
    amount: "12,235 GB",
  },
  {
    avatar: "mdi-content-save",
    title: "磁盘剩余空间",
    amount: "1.24 TB",
  },
];
</script>

<template>
  <VCard>
    <VCardItem>
      <VCardTitle>实时速率</VCardTitle>

      <template #append>
        <div class="me-n3">
          <MoreBtn />
        </div>
      </template>
    </VCardItem>

    <VCardText class="pt-4">
      <div class="d-flex align-center">
        <h4 class="text-h4 me-2">
          ↑21 KB/s <br />
          ↓24,895 KB/s
        </h4>
      </div>
      <VList class="card-list mt-9">
        <VListItem v-for="earning in earnings" :key="earning.title">
          <template #prepend>
            <VIcon rounded :icon="earning.avatar" />
          </template>

          <VListItemTitle class="text-sm font-weight-medium mb-1">
            {{ earning.title }}
          </VListItemTitle>

          <template #append>
            <div>
              <h6 class="text-sm font-weight-medium mb-2">
                {{ earning.amount }}
              </h6>
            </div>
          </template>
        </VListItem>
      </VList>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.card-list {
  --v-card-list-gap: 1rem;
}
</style>
