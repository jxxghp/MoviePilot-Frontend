<script lang="ts" setup>
import api from '@/api'
import type { User } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import UserCard from '@/components/cards/UserCard.vue'
import UserAddEditDialog from '@/components/dialog/UserAddEditDialog.vue'
import VirtualGrid from '@/components/virtual/VirtualGrid.vue'
import { useBreakpointCols } from '@/composables/virtual/useBreakpointCols'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'

// 列数：按视口断点（路由级全宽页，min-item-width=288 → 1xs 2sm 3md 4lg 5xl）
const cols = useBreakpointCols({ xs: 1, sm: 2, md: 3, lg: 4, xl: 5, xxl: 5 })

// 国际化
const { t } = useI18n()

// 路由
const route = useRoute()

// PWA模式检测
const { appMode } = usePWA()

// 是否刷新过
const isRefreshed = ref(false)

// 是否加载中
const loading = ref(false)

// 新增用户窗口
const addUserDialog = ref(false)

// 所有用户信息
const allUsers = ref<User[]>([])

// 调用API，查询所有用户
async function loadAllUsers() {
  try {
    loading.value = true
    const result: User[] = await api.get('/user/')
    allUsers.value = result
    loading.value = false
    isRefreshed.value = true
  } catch (error) {
    console.log(error)
  }
}

// 用户新增完成
const onUserAdd = () => {
  addUserDialog.value = false
  loadAllUsers()
}

// 打开添加用户对话框
const openAddUserDialog = () => {
  addUserDialog.value = true
}

// 加载当前用户数据
onMounted(() => {
  loadAllUsers()
})

onActivated(() => {
  if (!loading.value) {
    loadAllUsers()
  }
})

// 使用动态按钮钩子
useDynamicButton({
  icon: 'mdi-account-plus',
  onClick: () => {
    openAddUserDialog()
  },
})
</script>

<template>
  <!-- 页面标题 -->
  <VPageContentTitle :title="t('user.management')" />
  <div class="card-list-container">
    <!-- 加载中提示 -->
    <LoadingBanner v-if="!isRefreshed" class="mt-12" />
    <!-- 用户卡片网格 -->
    <VirtualGrid
      v-if="allUsers.length > 0 && isRefreshed"
      :items="allUsers"
      :columns="cols"
      :row-estimate-size="260"
      :gap="16"
      key-field="id"
      use-window-scroll
      class="px-2"
    >
      <!-- 普通用户卡片 -->
      <template #item="{ item }">
        <UserCard :user="item" :users="allUsers" @remove="loadAllUsers" @save="loadAllUsers" />
      </template>
    </VirtualGrid>

    <!-- 无数据提示 -->
    <div v-if="allUsers.length === 0 && isRefreshed">
      <NoDataFound error-code="404" :error-title="t('user.noUsers')" :error-description="t('user.clickToAddUser')" />
    </div>

    <!-- 新增用户按钮 -->
    <Teleport to="body" v-if="route.path === '/user'">
      <div v-if="isRefreshed && !appMode" class="compact-fab-stack">
        <VFab
          icon="mdi-account-plus"
          color="primary"
          appear
          class="compact-fab compact-fab--primary"
          @click="openAddUserDialog"
        />
      </div>
    </Teleport>

    <!-- 用户添加弹窗 -->
    <UserAddEditDialog
      v-if="addUserDialog"
      v-model="addUserDialog"
      oper="add"
      max-width="45rem"
      @save="onUserAdd"
      @close="addUserDialog = false"
    />
  </div>
</template>
