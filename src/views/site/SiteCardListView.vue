<script lang="ts" setup>
import draggable from 'vuedraggable'
import api from '@/api'
import type { Site } from '@/api/types'
import SiteCard from '@/components/cards/SiteCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import SiteAddEditDialog from '@/components/dialog/SiteAddEditDialog.vue'
import { useDisplay } from 'vuetify'
import { isLength } from 'lodash'

// 显示器宽度
const display = useDisplay()

// APP
const appMode = computed(() => {
  return localStorage.getItem('MP_APPMODE') != '0' && display.mdAndDown.value
})

// 数据列表
const dataList = ref<Site[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// 是否加载中
const loading = ref(false)

// 新增站点对话框
const siteAddDialog = ref(false)

// 获取站点列表数据
async function fetchData() {
  try {
    loading.value = true
    dataList.value = await api.get('site/')
    loading.value = false
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

// 保存站点排序
async function savaSitesPriority() {
  // 重新排序
  const priorities = dataList.value.map((site, index) => ({ id: site.id, pri: index + 1 }))
  try {
    const result: { [key: string]: any } = await api.post('site/priorities', priorities)
    if (result.success) {
      fetchData()
    }
  } catch (error) {
    console.error(error)
  }
}

// 加载时获取数据
onBeforeMount(fetchData)

onActivated(() => {
  if (!loading.value) {
    fetchData()
  }
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <div>
    <draggable
      v-if="dataList.length > 0"
      v-model="dataList"
      @end="savaSitesPriority"
      handle=".cursor-move"
      item-key="id"
      tag="div"
      :component-data="{ 'class': 'grid gap-3 grid-site-card' }"
    >
      <template #item="{ element }">
        <SiteCard :site="element" @remove="fetchData" @update="fetchData" />
      </template>
    </draggable>
  </div>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    error-title="没有站点"
    error-description="已添加并支持的站点将会在这里显示。"
  />
  <!-- 新增站点按钮 -->
  <VFab
    icon="mdi-plus"
    location="bottom"
    size="x-large"
    fixed
    app
    appear
    @click="siteAddDialog = true"
    :class="{ 'mb-12': appMode }"
  />
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
