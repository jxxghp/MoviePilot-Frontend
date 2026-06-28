<script lang="ts" setup>
import api from '@/api'
import type { User } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import UserCard from '@/components/cards/UserCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'

const UserAddEditDialog = defineAsyncComponent(() => import('@/components/dialog/UserAddEditDialog.vue'))

// 国际化
const { t } = useI18n()

// 路由
const route = useRoute()
const userStore = useUserStore()
const canAdmin = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'admin'),
)

// PWA模式检测
const { appMode } = usePWA()

// 是否刷新过
const isRefreshed = ref(false)

// 是否加载中
const loading = ref(false)

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
  loadAllUsers()
}

// 打开添加用户对话框
const openAddUserDialog = () => {
  openSharedDialog(
    UserAddEditDialog,
    {
      oper: 'add',
      maxWidth: '45rem',
    },
    {
      save: onUserAdd,
    },
    { closeOn: ['close', 'save'] },
  )
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
  permission: 'admin',
})
</script>

<template>
  <!-- 页面标题 -->
  <div class="d-flex justify-space-between align-center mb-3">
    <VPageContentTitle :title="t('user.management')" />
  </div>
  <div class="card-list-container">
    <!-- 加载中提示 -->
    <LoadingBanner v-if="!isRefreshed" class="mt-12" />
    <!-- 用户卡片网格 -->
    <ProgressiveCardGrid
      v-if="allUsers.length > 0 && isRefreshed"
      :items="allUsers"
      :min-item-width="288"
      :estimated-item-height="260"
      :get-item-key="user => user.id"
      class="px-2"
    >
      <!-- 普通用户卡片 -->
      <template #default="{ item }">
        <UserCard :user="item" :users="allUsers" @remove="loadAllUsers" @save="loadAllUsers" />
      </template>
    </ProgressiveCardGrid>

    <!-- 无数据提示 -->
    <div v-if="allUsers.length === 0 && isRefreshed">
      <NoDataFound error-code="404" :error-title="t('user.noUsers')" :error-description="t('user.clickToAddUser')" />
    </div>

    <!-- 新增用户按钮 -->
    <Teleport to="body" v-if="route.path === '/user'">
      <div v-if="isRefreshed && !appMode && canAdmin" class="compact-fab-stack">
        <VFab
          icon="mdi-account-plus"
          color="primary"
          appear
          class="compact-fab compact-fab--primary"
          @click="openAddUserDialog"
        />
      </div>
    </Teleport>
  </div>
</template>
