<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import type { User } from '@/api/types'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import api from '@/api'
import { useDisplay } from 'vuetify'
import avatar1 from '@images/avatars/avatar-1.png'
import store from '@/store'
import { debounce } from 'lodash'

// 显示器宽度
const display = useDisplay()

const refInputEl = ref<HTMLElement>()
const isNewPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')

// 输入参数
const props = defineProps({
  username: String,
  usernames: Array,
  oper: String,
})

// 防抖时间
const debounceTime = 500

// 当前登录用户名称
const currentLoginUser = store.state.auth.userName

// 用户名
const userName = ref('')

// 当前头像缓存
const currentAvatar = ref(avatar1)

// 用户名缓存
const currentUserName = ref('')

// 注册事件
const emit = defineEmits(['save', 'close'])

// 创建新用户按钮运行状态
const isAdding = ref(false)

// 更新用户消息按钮运行状态
const isUpdating = ref(false)

// 提示框
const $toast = useToast()

// 状态下拉项
const statusItems = [
  { title: '激活', value: 1 },
  { title: '已停用', value: 0 },
]

// 用户编辑表单数据
const userForm = ref<User>({
  id: 0,
  name: props.username ?? '',
  password: '',
  email: '',
  is_active: false,
  is_superuser: false,
  avatar: avatar1,
  is_otp: false,
  permissions: {},
  settings: {
    wechat_userid: null,
    telegram_userid: null,
    slack_userid: null,
    vocechat_userid: null,
    synologychat_userid: null,
  },
})

// 更新头像
function changeAvatar(file: Event) {
  const fileReader = new FileReader()
  const { files } = file.target as HTMLInputElement
  if (files && files.length > 0) {
    fileReader.readAsDataURL(files[0])
    fileReader.onload = () => {
      if (typeof fileReader.result === 'string') {
        currentAvatar.value = fileReader.result
      }
    }
  }
}

// 重置默认头像
function resetDefaultAvatar() {
  currentAvatar.value = avatar1
  $toast.success('已重置为默认头像，待保存后生效！')
}

// 还原当前头像
function restoreCurrentAvatar() {
  currentAvatar.value = userForm.value.avatar
  $toast.success('已还原当前使用头像！')
}

// 查询用户信息
async function fetchUserInfo() {
  try {
    userForm.value = await api.get(`user/${props.username}`)
    if (userForm.value) {
      userForm.value.avatar = userForm.value.avatar || avatar1
      currentAvatar.value = userForm.value.avatar
      currentUserName.value = userForm.value.name
      userName.value = userForm.value.name
    }
  } catch (error) {
    console.error(error)
  }
}

// 调用API 新增用户
const addUser = debounce(async () => {
  if (isAdding.value) {
    $toast.error(`正在创建【${userForm.value.name}】用户，请稍后`)
    return
  }
  if (!currentUserName.value) {
    $toast.error('用户名不能为空')
    return
  } else userForm.value.name = currentUserName.value
  // 重名检查
  if (props.usernames && props.usernames.includes(userForm.value.name)) {
    $toast.error('用户名已存在')
    return
  }
  if (!userForm.value?.name || !newPassword.value) return
  if (newPassword.value || confirmPassword.value) {
    if (newPassword.value !== confirmPassword.value) {
      $toast.error('两次输入的密码不一致')
      return
    }
    userForm.value.password = newPassword.value
  }
  isAdding.value = true
  startNProgress()
  try {
    const result: { [key: string]: string } = await api.post('user/', userForm.value)
    if (result.success) {
      $toast.success(`用户【${userForm.value.name}】创建成功`)
      emit('save')
    } else {
      $toast.error(`创建用户失败：${result.message}`)
      // 清除用户名
      userForm.value.name = ''
    }
  } catch (error) {
    console.error(error)
  }
  doneNProgress()
  isAdding.value = false
}, debounceTime)

// 调用API更新用户信息
const updateUser = debounce(async () => {
  if (isUpdating.value) {
    $toast.error(`正在更新【${userForm.value.name}】用户，请稍后`)
    return
  }
  if (!currentUserName.value) {
    $toast.error('用户名不能为空')
    return
  }
  if (newPassword.value || confirmPassword.value) {
    if (newPassword.value !== confirmPassword.value) {
      $toast.error('两次输入的密码不一致')
      return
    }
    userForm.value.password = newPassword.value
  }
  const oldUserName = userForm.value.name
  userForm.value.name = currentUserName.value
  const oldAvatar = userForm.value.avatar
  userForm.value.avatar = currentAvatar.value
  isUpdating.value = true
  startNProgress()
  try {
    const result: { [key: string]: any } = await api.put('user/', userForm.value)
    if (result.success) {
      if (oldUserName !== currentUserName.value) {
        $toast.success(`【${oldUserName}】更名【${currentUserName.value}】， 更新成功！`)
        // 如果是当前登录用户，更新当前用户名称显示
        if (isCurrentUser.value) store.commit('auth/setUserName', currentUserName.value)
      } else {
        $toast.success(`【${userForm.value?.name}】更新成功！`)
      }
      // 更新本地头像显示
      if (oldAvatar !== currentAvatar.value && isCurrentUser.value) {
        store.commit('auth/setAvatar', currentAvatar.value)
      }
      emit('save')
    } else {
      if (oldUserName !== currentUserName.value) {
        $toast.error(`【${oldUserName}】更名【${currentUserName.value}】， 更新失败：${result.message}`)
        currentUserName.value = oldUserName
      } else {
        $toast.error(`【${userForm.value?.name}】更新失败：${result.message}`)
      }
    }
    //失败缓存值还原
    currentUserName.value = userForm.value.name
    userForm.value.name = oldUserName
    currentAvatar.value = userForm.value.avatar
    userForm.value.avatar = oldAvatar
    userForm.value.password = ''
  } catch (error) {
    $toast.error(`【${userForm.value?.name}】更新失败！`)
    console.error(error)
  }
  doneNProgress()
  isUpdating.value = false
}, debounceTime)

// 用户状态转换，true/false转换为1/0
const userStatus = computed({
  get: () => (userForm.value.is_active ? 1 : 0),
  set: (value: number) => {
    userForm.value.is_active = value === 1
  },
})

// 计算是否有用户管理权限
const canControl = computed(() => {
  // 新增用户时，有权限
  if (props.oper === 'add') {
    return true
  } else {
    // 调用isCurrentUser函数判断是否为当前用户
    return !isCurrentUser.value
  }
})

// 检查是否为当前用户
const isCurrentUser = computed(() => {
  return props.username === currentLoginUser
})

onMounted(() => {
  if (props.oper !== 'add') {
    fetchUserInfo()
  }
})
</script>

<template>
  <VDialog scrollable :close-on-back="false" persistent eager max-width="50rem" :fullscreen="!display.mdAndUp.value">
    <VCard
      :title="`${props.oper === 'add' ? '新增' : '编辑'}用户${props.oper !== 'add' ? ` - ${userName}` : ''}`"
      class="rounded-t"
    >
      <DialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="d-flex">
        <!-- 👉 Avatar -->
        <VAvatar rounded="lg" size="100" class="me-6" :image="currentAvatar" />

        <!-- 👉 Upload Photo -->
        <form class="d-flex flex-column justify-center gap-5">
          <div class="d-flex flex-wrap gap-2">
            <VBtn color="primary" @click="refInputEl?.click()">
              <VIcon icon="mdi-cloud-upload-outline" />
              <span v-if="display.mdAndUp.value" class="ms-2">上传新头像</span>
            </VBtn>

            <input ref="refInputEl" type="file" name="file" accept=".jpeg,.png,.jpg,GIF" hidden @input="changeAvatar" />

            <VBtn type="reset" color="info" variant="tonal" @click="restoreCurrentAvatar" v-if="props.oper !== 'add'">
              <VIcon icon="mdi-refresh" />
              <span v-if="display.mdAndUp.value" class="ms-2">重置</span>
            </VBtn>

            <VBtn
              type="reset"
              :color="props.oper === 'add' ? 'info' : 'error'"
              variant="tonal"
              @click="resetDefaultAvatar"
            >
              <VIcon icon="mdi-image-sync-outline" />
              <span v-if="display.mdAndUp.value" class="ms-2">默认</span>
            </VBtn>
          </div>

          <p class="text-body-1 mb-0">允许 JPG、PNG、GIF 格式， 最大尺寸 800K。</p>
        </form>
      </VCardText>
      <VCardText>
        <VForm @submit.prevent="() => {}" class="mt-3">
          <VDivider class="my-10">
            <span>用户基础设置</span>
          </VDivider>
          <VRow>
            <VCol md="6" cols="12">
              <VTextField
                v-model="currentUserName"
                density="comfortable"
                :readonly="props.oper !== 'add'"
                label="用户名"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField v-model="userForm.email" density="comfortable" clearable label="邮箱" type="email" />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="newPassword"
                density="comfortable"
                :type="isNewPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="isNewPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                clearable
                label="密码"
                autocomplete=""
                @click:append-inner="isNewPasswordVisible = !isNewPasswordVisible"
              />
            </VCol>
            <VCol cols="12" md="6">
              <!-- 👉 confirm password -->
              <VTextField
                v-model="confirmPassword"
                density="comfortable"
                :type="isConfirmPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="isConfirmPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                clearable
                label="确认密码"
                @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
              />
            </VCol>
            <VCol cols="12" md="6" v-if="canControl">
              <VSelect
                v-model="userStatus"
                :items="statusItems"
                item-text="title"
                item-value="value"
                label="状态"
                dense
              />
            </VCol>
          </VRow>
          <VDivider class="my-10">
            <span>消息账号绑定</span>
          </VDivider>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField v-model="userForm.settings.wechat_userid" density="comfortable" clearable label="微信用户" />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.settings.telegram_userid"
                density="comfortable"
                clearable
                label="Telegram用户"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField v-model="userForm.settings.slack_userid" density="comfortable" clearable label="Slack用户" />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.settings.vocechat_userid"
                density="comfortable"
                clearable
                label="VoceChat用户"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.settings.synologychat_userid"
                density="comfortable"
                clearable
                label="SynologyChat用户"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="pt-3">
        <VSpacer />
        <VBtn
          v-if="props.oper === 'add'"
          :disabled="isAdding"
          color="primary"
          variant="elevated"
          @click="addUser"
          prepend-icon="mdi-plus"
          class="px-5"
        >
          <span v-if="isAdding">创建中...</span>
          <span v-else>创建</span>
        </VBtn>
        <VBtn
          v-else
          :disabled="isUpdating"
          color="primary"
          variant="elevated"
          @click="updateUser"
          prepend-icon="mdi-content-save"
          class="px-5"
        >
          <span v-if="isUpdating">更新中...</span>
          <span v-else>更新</span>
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
