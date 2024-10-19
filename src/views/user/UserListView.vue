<script lang="ts" setup>
import api from '@/api'
import type { User } from '@/api/types'
import { useDisplay } from 'vuetify'
import NoDataFound from '@/components/NoDataFound.vue'
import UserCard from '@/components/cards/UserCard.vue'
import UserAddEditDialog from '@/components/dialog/UserAddEditDialog.vue'

// APP
const appMode = inject('appMode')

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

// 加载当前用户数据
onMounted(() => {
  loadAllUsers()
})

onActivated(() => {
  if (!loading.value) {
    loadAllUsers()
  }
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />

  <div v-if="allUsers.length > 0" class="grid gap-3 grid-user-card">
    <UserCard v-for="user in allUsers" :user="user" :users="allUsers" @remove="loadAllUsers" @save="loadAllUsers" />
  </div>

  <NoDataFound
    v-if="allUsers.length === 0 && isRefreshed"
    error-code="404"
    error-title="没有用户"
    error-description="点击右下角按钮添加用户"
  />

  <VFab
    icon="mdi-plus"
    location="bottom"
    size="x-large"
    fixed
    app
    appear
    @click="addUserDialog = true"
    :class="{ 'mb-12': appMode }"
  />

  <!-- 弹窗 -->
  <UserAddEditDialog
    v-if="addUserDialog"
    v-model="addUserDialog"
    oper="add"
    max-width="50rem"
    persistent
    z-index="1010"
    @save="onUserAdd"
    @close="addUserDialog = false"
  />
</template>
