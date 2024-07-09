<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { VForm } from 'vuetify/lib/components/index.mjs'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { User } from '@/api/types'
import avatar1 from '@images/avatars/avatar-1.png'
import { useDisplay } from 'vuetify'

// APP
const display = useDisplay()
const appMode = computed(() => {
  return localStorage.getItem('MP_APPMODE') != '0' && display.mdAndDown.value
})

// 提示框
const $toast = useToast()

// 新增用户窗口
const addUserDialog = ref(false)

const isPasswordVisible = ref(false)

// 新增用户表单
const userForm = reactive({
  name: '',
  password: '',
  email: '',
})

// 当前用户信息
const accountInfo = ref<User>({
  id: 0,
  name: '',
  password: '',
  email: '',
  is_active: false,
  is_superuser: false,
  avatar: '',
  is_otp: false,
  permissions: {},
  settings: {},
})

// 所有用户信息
const allUsers = ref<User[]>([])

// 调用API，加载当前用户数据
async function loadAccountInfo() {
  try {
    const user: User = await api.get('user/current')
    console.log(user)
    accountInfo.value = user
    if (!accountInfo.value.avatar) accountInfo.value.avatar = avatar1
  } catch (error) {
    console.log(error)
  }
}

// 调用API，查询所有用户
async function loadAllUsers() {
  try {
    const result: User[] = await api.get('/user/')

    allUsers.value = result
  } catch (error) {
    console.log(error)
  }
}

// 删除用户
async function deleteUser(user: User) {
  try {
    const result: { [key: string]: any } = await api.delete(`user/${user.name}`)
    if (result.success) {
      $toast.success('用户删除成功！')
      loadAllUsers()
    } else {
      $toast.error(`用户删除失败：${result.message}！`)
    }
  } catch (error) {
    console.log(error)
  }
}

// 冻结用户
async function deactivateUser(user: User) {
  try {
    user.is_active = !user.is_active

    const result: { [key: string]: any } = await api.put('user/', user)
    if (result.success) {
      $toast.success('用户冻结成功！')
      loadAllUsers()
    } else {
      $toast.error(`用户冻结失败：${result.message}！`)
    }
  } catch (error) {
    console.log(error)
  }
}

// 新增用户
async function addUser() {
  if (!userForm.name || !userForm.password || !userForm.email) {
    $toast.error('请填写完整信息！')
    return
  }
  try {
    const result: { [key: string]: any } = await api.post('user/', userForm)
    if (result.success) {
      $toast.success('用户新增成功！')
      loadAllUsers()
      addUserDialog.value = false
    } else {
      $toast.error(`用户新增失败：${result.message}！`)
    }
  } catch (error) {
    console.log(error)
  }
}

// 加载当前用户数据
onMounted(() => {
  loadAccountInfo()
  loadAllUsers()
})
</script>

<template>
  <div>
    <VRow>
      <VCol v-if="accountInfo.is_superuser" cols="12">
        <!-- 👉 Accounts -->
        <VCard title="所有用户">
          <template #append>
            <IconBtn @click.stop="addUserDialog = true">
              <VIcon icon="mdi-plus" />
            </IconBtn>
          </template>
          <VTable class="text-no-wrap">
            <thead>
              <tr>
                <th scope="col">用户名</th>
                <th scope="col">邮箱</th>
                <th scope="col">状态</th>
                <th scope="col">管理员</th>
                <th scope="col" class="w-5" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in allUsers" :key="user.name">
                <td>
                  {{ user.name }}
                </td>
                <td>{{ user.email }}</td>
                <td>
                  <VChip v-if="user.is_active" color="success" text-color="white"> 激活 </VChip>
                  <VChip v-else color="error" text-color="white"> 冻结 </VChip>
                </td>
                <td>{{ user.is_superuser ? '是' : '否' }}</td>
                <td>
                  <IconBtn v-show="accountInfo.is_superuser && accountInfo.name !== user.name">
                    <VIcon icon="mdi-dots-vertical" />
                    <VMenu activator="parent" close-on-content-click>
                      <VList>
                        <VListItem variant="plain" @click="deactivateUser(user)">
                          <template #prepend>
                            <VIcon icon="mdi-lock" />
                          </template>
                          <VListItemTitle>
                            {{ user.is_active ? '冻结' : '解冻' }}
                          </VListItemTitle>
                        </VListItem>
                        <VListItem variant="plain" base-color="error" @click="deleteUser(user)">
                          <template #prepend>
                            <VIcon icon="mdi-delete" />
                          </template>
                          <VListItemTitle>删除</VListItemTitle>
                        </VListItem>
                      </VList>
                    </VMenu>
                  </IconBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
        </VCard>
      </VCol>
    </VRow>
    <!-- =弹窗 -->
    <VDialog v-model="addUserDialog" max-width="50rem" persistent z-index="1010">
      <!-- Dialog Content -->
      <VCard title="新增用户">
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <VRow>
              <VCol cols="12" md="6">
                <VTextField v-model="userForm.name" label="用户名" :rules="[requiredValidator]" />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="userForm.password"
                  label="密码"
                  :rules="[requiredValidator]"
                  :type="isPasswordVisible ? 'text' : 'password'"
                  :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                  @click:append-inner="isPasswordVisible = !isPasswordVisible"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField v-model="userForm.email" :rules="[requiredValidator]" label="邮箱" />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardActions>
          <VBtn @click="addUserDialog = false"> 取消 </VBtn>
          <VSpacer />
          <VBtn @click="addUser"> 确定 </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>

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
</template>
