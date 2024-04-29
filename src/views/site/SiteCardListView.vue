<script lang="ts" setup>
import api from '@/api'
import type { Site } from '@/api/types'
import SiteCard from '@/components/cards/SiteCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import SiteAddEditDialog from '@/components/dialog/SiteAddEditDialog.vue'
import { useDefer } from '@/@core/utils/dom'

// 数据列表
const dataList = ref<Site[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// 新增站点对话框
const siteAddDialog = ref(false)

// 延迟加载
let defer = (_: number) => true

// 获取站点列表数据
async function fetchData() {
  try {
    dataList.value = await api.get('site/')
    isRefreshed.value = true
    defer = useDefer(dataList.value.length)
  } catch (error) {
    console.error(error)
  }
}

// 加载时获取数据
onBeforeMount(fetchData)
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <div v-if="dataList.length > 0" class="grid gap-3 grid-site-card">
    <div v-for="(data, index) in dataList" :key="index">
      <SiteCard v-if="defer(index)" :key="data.id" :site="data" @remove="fetchData" @update="fetchData" />
    </div>
  </div>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    error-title="没有站点"
    error-description="已添加并支持的站点将会在这里显示。"
  />
  <!-- 新增站点按钮 -->
  <VFab icon="mdi-plus" location="bottom end" size="x-large" fixed app appear @click="siteAddDialog = true" />
  <!-- 新增站点弹窗 -->
  <SiteAddEditDialog
    v-if="siteAddDialog"
    v-model="siteAddDialog"
    oper="add"
    @save="
      () => {
        siteAddDialog = false
        fetchData()
      }
    "
    @close="siteAddDialog = false"
  />
</template>

<style lang="scss">
.grid-site-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
