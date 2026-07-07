<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import type { User } from '@/api/types'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import api from '@/api'
import { useDisplay } from 'vuetify'
import avatar1 from '@images/avatars/avatar-1.png'
import { useUserStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import {
  USER_PERMISSION_FEATURES,
  buildDefaultFeaturePermissions,
  normalizeUserPermissions,
  type UserPermissionCategoryKey,
  type UserPermissionFeatureKey,
  type UserPermissions,
} from '@/utils/permission'

// 多语言支持
const { t } = useI18n()

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

// 用户 Store
const userStore = useUserStore()

// 当前登录用户名称
const currentLoginUser = userStore.userName

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
  { title: t('dialog.userAddEdit.active'), value: 1 },
  { title: t('dialog.userAddEdit.inactive'), value: 0 },
]

// 扩展User类型以包含note字段
interface ExtendedUser extends User {
  nickname?: string
}

// 用户编辑表单数据
const userForm = ref<ExtendedUser>({
  id: 0,
  name: props.username ?? '',
  password: '',
  email: '',
  is_active: true,
  is_superuser: false,
  avatar: avatar1,
  is_otp: false,
  permissions: {
    discovery: true,
    search: true,
    subscribe: true,
    manage: false,
    features: buildDefaultFeaturePermissions(),
  },
  settings: {
    wechat_userid: null,
    wechatclawbot_userid: null,
    telegram_userid: null,
    slack_userid: null,
    discord_userid: null,
    vocechat_userid: null,
    synologychat_userid: null,
  },
  nickname: '', // 昵称字段
})

// 权限选项
const permissionOptions = [
  {
    key: 'discovery',
    title: t('dialog.userAddEdit.permissions.discovery'),
    description: t('dialog.userAddEdit.permissions.discoveryDesc'),
    icon: 'mdi-star-outline',
  },
  {
    key: 'search',
    title: t('dialog.userAddEdit.permissions.search'),
    description: t('dialog.userAddEdit.permissions.searchDesc'),
    icon: 'mdi-magnify',
  },
  {
    key: 'subscribe',
    title: t('dialog.userAddEdit.permissions.subscribe'),
    description: t('dialog.userAddEdit.permissions.subscribeDesc'),
    icon: 'mdi-rss',
  },
  {
    key: 'manage',
    title: t('dialog.userAddEdit.permissions.manage'),
    description: t('dialog.userAddEdit.permissions.manageDesc'),
    icon: 'mdi-cog-outline',
  },
] as const

const activePermissionCategory = ref<UserPermissionCategoryKey>('discovery')

// 权限状态计算属性
const userPermissions = computed({
  get: () => {
    return normalizeUserPermissions(userForm.value.permissions as Partial<UserPermissions>)
  },
  set: (value: UserPermissions) => {
    userForm.value.permissions = value
  },
})

const permissionFeatureOptions = computed(() =>
  USER_PERMISSION_FEATURES.map(feature => ({
    ...feature,
    title: t(feature.titleKey),
    description: t(feature.descriptionKey),
  })),
)

const activePermissionOption = computed(() =>
  permissionOptions.find(option => option.key === activePermissionCategory.value) ?? permissionOptions[0],
)

const activePermissionFeatures = computed(() =>
  permissionFeatureOptions.value.filter(feature => feature.permission === activePermissionCategory.value),
)

const enabledCategoryCount = computed(
  () => permissionOptions.filter(option => userPermissions.value[option.key]).length,
)

const enabledFeatureCount = computed(
  () =>
    permissionFeatureOptions.value.filter(
      feature => userPermissions.value[feature.permission] && isFeatureEnabled(feature.key),
    ).length,
)

/** 切换当前查看的权限分类。 */
function selectPermissionCategory(key: UserPermissionCategoryKey) {
  activePermissionCategory.value = key
}

/** 切换权限分类启用状态，并聚焦到该分类的功能列表。 */
function togglePermission(key: UserPermissionCategoryKey) {
  const currentPermissions = userPermissions.value
  userPermissions.value = {
    ...currentPermissions,
    [key]: !currentPermissions[key],
  }
  activePermissionCategory.value = key
}

/** 判断功能项是否已启用，缺省功能按启用处理以兼容旧权限数据。 */
function isFeatureEnabled(key: UserPermissionFeatureKey) {
  return userPermissions.value.features?.[key] !== false
}

/** 切换单个功能项的启用状态。 */
function togglePermissionFeature(key: UserPermissionFeatureKey) {
  userPermissions.value = {
    ...userPermissions.value,
    features: {
      ...(userPermissions.value.features ?? {}),
      [key]: !isFeatureEnabled(key),
    },
  }
}

/** 统计指定分类下已经勾选的功能数量。 */
function getEnabledFeatureCount(permission: UserPermissionCategoryKey) {
  return permissionFeatureOptions.value.filter(
    feature => feature.permission === permission && isFeatureEnabled(feature.key),
  ).length
}

/** 返回指定分类下的功能总数。 */
function getFeatureTotalCount(permission: UserPermissionCategoryKey) {
  return permissionFeatureOptions.value.filter(feature => feature.permission === permission).length
}

/** 判断指定分类是否处于功能部分勾选状态。 */
function isPermissionPartiallySelected(permission: UserPermissionCategoryKey) {
  const enabledCount = getEnabledFeatureCount(permission)
  const totalCount = getFeatureTotalCount(permission)
  return enabledCount > 0 && enabledCount < totalCount
}

/** 批量设置当前分类下的所有功能项。 */
function setCategoryFeatures(permission: UserPermissionCategoryKey, enabled: boolean) {
  const nextFeatures = { ...(userPermissions.value.features ?? {}) }
  for (const feature of permissionFeatureOptions.value.filter(item => item.permission === permission)) {
    nextFeatures[feature.key] = enabled
  }
  userPermissions.value = {
    ...userPermissions.value,
    features: nextFeatures,
  }
}

/** 将当前分类下的功能项恢复为默认全选状态。 */
function resetCategoryFeatures(permission: UserPermissionCategoryKey) {
  setCategoryFeatures(permission, true)
}

/** 校验并读取用户上传的新头像。 */
function changeAvatar(file: Event) {
  const fileReader = new FileReader()
  const { files } = file.target as HTMLInputElement
  if (files && files.length > 0) {
    const selectedFile = files[0]
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    const maxSize = 800 * 1024
    // 检查文件是否为图片
    if (!allowedTypes.includes(selectedFile.type)) {
      $toast.error(t('dialog.userAddEdit.invalidFile'))
      return
    }
    // 检查文件大小
    if (selectedFile.size > maxSize) {
      $toast.error(t('dialog.userAddEdit.fileSizeLimit'))
      return
    }
    fileReader.readAsDataURL(selectedFile)
    fileReader.onload = () => {
      if (typeof fileReader.result === 'string') {
        currentAvatar.value = fileReader.result
        $toast.success(t('dialog.userAddEdit.avatarUploadSuccess'))
      }
    }
  }
}

/** 将头像恢复为系统默认头像。 */
function resetDefaultAvatar() {
  currentAvatar.value = avatar1
  $toast.success(t('dialog.userAddEdit.resetAvatarSuccess'))
}

/** 还原为用户当前已保存的头像。 */
function restoreCurrentAvatar() {
  currentAvatar.value = userForm.value.avatar
  $toast.success(t('dialog.userAddEdit.restoreAvatarSuccess'))
}

/** 从接口查询当前编辑用户的信息并回填表单。 */
async function fetchUserInfo() {
  try {
    userForm.value = await api.get(`user/${props.username}`)
    if (userForm.value) {
      userForm.value.avatar = userForm.value.avatar || avatar1
      userForm.value.nickname = userForm.value.settings?.nickname ?? ''
      currentAvatar.value = userForm.value.avatar
      currentUserName.value = userForm.value.name
      userName.value = userForm.value.name
    }
  } catch (error) {
    console.error(error)
  }
}

/** 调用接口创建新用户。 */
async function addUser() {
  if (isAdding.value) {
    $toast.error(t('dialog.userAddEdit.creatingUser', { name: userForm.value.name }))
    return
  }
  if (!currentUserName.value) {
    $toast.error(t('dialog.userAddEdit.usernameRequired'))
    return
  } else userForm.value.name = currentUserName.value
  // 重名检查
  if (props.usernames && props.usernames.includes(userForm.value.name)) {
    $toast.error(t('dialog.userAddEdit.usernameExists'))
    return
  }
  if (!userForm.value?.name || !newPassword.value) return
  if (newPassword.value || confirmPassword.value) {
    if (newPassword.value !== confirmPassword.value) {
      $toast.error(t('dialog.userAddEdit.passwordMismatch'))
      return
    }
    userForm.value.password = newPassword.value
  }

  // 设置权限数据
  userForm.value.permissions = userPermissions.value

  isAdding.value = true
  startNProgress()
  try {
    const result: { [key: string]: string } = await api.post('user/', userForm.value)
    if (result.success) {
      $toast.success(t('dialog.userAddEdit.userCreated', { name: userForm.value.name }))
      emit('save')
    } else {
      $toast.error(t('dialog.userAddEdit.userCreateFailed', { message: result.message }))
      // 清除用户名
      userForm.value.name = ''
    }
  } catch (error) {
    console.error(error)
  }
  doneNProgress()
  isAdding.value = false
}

/** 调用接口更新当前用户信息。 */
async function updateUser() {
  if (isUpdating.value) {
    $toast.error(t('dialog.userAddEdit.updatingUser', { name: userForm.value.name }))
    return
  }
  if (!currentUserName.value) {
    $toast.error(t('dialog.userAddEdit.usernameRequired'))
    return
  }
  if (newPassword.value || confirmPassword.value) {
    if (newPassword.value !== confirmPassword.value) {
      $toast.error(t('dialog.userAddEdit.passwordMismatch'))
      return
    }
    userForm.value.password = newPassword.value
  }

  // 将nickname保存到settings中，后端可以直接处理JSON对象
  if (!userForm.value.settings) {
    userForm.value.settings = {}
  }
  userForm.value.settings.nickname = userForm.value.nickname ?? ''

  const oldUserName = userForm.value.name
  userForm.value.name = currentUserName.value
  const oldAvatar = userForm.value.avatar
  userForm.value.avatar = currentAvatar.value
  isUpdating.value = true
  startNProgress()
  try {
    // 确保昵称和权限保存，使用一个临时变量存储完整数据
    const userData = { ...userForm.value }
    // 确保权限数据正确传递
    userData.permissions = userPermissions.value

    const result: { [key: string]: any } = await api.put('user/', userData)

    if (result.success) {
      if (oldUserName !== currentUserName.value) {
        $toast.success(t('dialog.userAddEdit.userUpdateSuccess', { name: `${oldUserName} → ${currentUserName.value}` }))
        // 如果是当前登录用户，更新当前用户名称显示
        if (isCurrentUser.value) {
          userStore.setUserName(currentUserName.value)
        }
      } else {
        $toast.success(t('dialog.userAddEdit.userUpdateSuccess', { name: userForm.value?.name }))
      }
      // 更新本地头像显示
      if (oldAvatar !== currentAvatar.value && isCurrentUser.value) {
        userStore.setAvatar(currentAvatar.value)
      }
      // 如果是当前登录用户，更新权限信息
      if (isCurrentUser.value) {
        userStore.setPermissions(userPermissions.value)
      }
      emit('save')
    } else {
      if (oldUserName !== currentUserName.value) {
        $toast.error(t('dialog.userAddEdit.userUpdateFailed', { message: result.message }))
        currentUserName.value = oldUserName
      } else {
        $toast.error(t('dialog.userAddEdit.userUpdateFailed', { message: result.message }))
      }
    }
    //失败缓存值还原
    currentUserName.value = userForm.value.name
    userForm.value.name = oldUserName
    currentAvatar.value = userForm.value.avatar
    userForm.value.avatar = oldAvatar
    userForm.value.password = ''
  } catch (error) {
    $toast.error(t('dialog.userAddEdit.userUpdateFailed', { message: '' }))
    console.error('更新失败:', error)
  }
  doneNProgress()
  isUpdating.value = false
}

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
  <VDialog scrollable max-width="64rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem :class="props.oper === 'add' ? 'py-3' : 'py-2'">
        <template #prepend>
          <VIcon icon="mdi-account" class="me-2" />
        </template>
        <VCardTitle>{{ props.oper === 'add' ? t('dialog.userAddEdit.add') : t('dialog.userAddEdit.edit') }}</VCardTitle>
        <VCardSubtitle>{{ userName }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardItem>
        <!-- 👉 Avatar -->
        <div class="flex flex-row">
          <VAvatar rounded="lg" size="100" class="me-5" :image="currentAvatar" />
          <!-- 👉 Upload Photo -->
          <div class="flex flex-col justify-center gap-5">
            <div class="flex flex-wrap gap-2">
              <VBtn color="primary" @click="refInputEl?.click()">
                <VIcon icon="mdi-cloud-upload-outline" />
                <span v-if="display.mdAndUp.value" class="ms-2">{{ t('dialog.userAddEdit.uploadAvatar') }}</span>
              </VBtn>

              <input
                ref="refInputEl"
                type="file"
                name="file"
                accept=".jpeg,.png,.jpg,GIF"
                hidden
                @input="changeAvatar"
              />

              <VBtn type="reset" color="info" variant="tonal" @click="restoreCurrentAvatar" v-if="props.oper !== 'add'">
                <VIcon icon="mdi-refresh" />
                <span v-if="display.mdAndUp.value" class="ms-2">{{ t('common.cancel') }}</span>
              </VBtn>

              <VBtn
                type="reset"
                :color="props.oper === 'add' ? 'info' : 'error'"
                variant="tonal"
                @click="resetDefaultAvatar"
              >
                <VIcon icon="mdi-image-sync-outline" />
                <span v-if="display.mdAndUp.value" class="ms-2">{{ t('dialog.userAddEdit.resetDefaultAvatar') }}</span>
              </VBtn>
            </div>
            <p class="text-body-1 mb-0">{{ t('dialog.userAddEdit.fileSizeLimit') }}</p>
          </div>
        </div>
      </VCardItem>
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VDivider class="my-10">
            <span>{{ t('dialog.userAddEdit.saveUserInfo') }}</span>
          </VDivider>
          <VRow>
            <VCol md="6" cols="12">
              <VTextField
                v-model="currentUserName"
                density="comfortable"
                :readonly="props.oper !== 'add'"
                :label="t('dialog.userAddEdit.username')"
                prepend-inner-icon="mdi-account"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.email"
                density="comfortable"
                clearable
                :label="t('dialog.userAddEdit.email')"
                type="email"
                prepend-inner-icon="mdi-email"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="newPassword"
                density="comfortable"
                :type="isNewPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="isNewPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                clearable
                :label="t('dialog.userAddEdit.password')"
                autocomplete=""
                prepend-inner-icon="mdi-lock"
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
                :label="t('dialog.userAddEdit.confirmPassword')"
                prepend-inner-icon="mdi-lock-check"
                @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.nickname"
                density="comfortable"
                clearable
                :label="t('dialog.userAddEdit.nickname')"
                placeholder="显示昵称，优先于用户名显示"
                prepend-inner-icon="mdi-card-account-details"
              />
            </VCol>
            <VCol cols="12" md="6" v-if="canControl">
              <VSelect
                v-model="userStatus"
                :items="statusItems"
                item-text="title"
                item-value="value"
                :label="t('dialog.userAddEdit.status')"
                dense
                prepend-inner-icon="mdi-toggle-switch"
              />
            </VCol>
          </VRow>
          <VDivider class="my-10">
            <span>{{ t('dialog.userAddEdit.notifications') }}</span>
          </VDivider>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.settings.wechat_userid"
                density="comfortable"
                clearable
                :label="t('dialog.userAddEdit.wechat')"
                prepend-inner-icon="mdi-wechat"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.settings.wechatclawbot_userid"
                density="comfortable"
                clearable
                :label="t('dialog.userAddEdit.wechatClawBot')"
                prepend-inner-icon="mdi-robot-happy-outline"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.settings.telegram_userid"
                density="comfortable"
                clearable
                :label="t('dialog.userAddEdit.telegram')"
                prepend-inner-icon="mdi-send"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.settings.slack_userid"
                density="comfortable"
                clearable
                :label="t('dialog.userAddEdit.slack')"
                prepend-inner-icon="mdi-slack"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.settings.discord_userid"
                density="comfortable"
                clearable
                :label="t('dialog.userAddEdit.discord')"
                prepend-inner-icon="mdi-discord"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.settings.vocechat_userid"
                density="comfortable"
                clearable
                :label="t('dialog.userAddEdit.vocechat')"
                prepend-inner-icon="mdi-chat"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.settings.synologychat_userid"
                density="comfortable"
                clearable
                :label="t('dialog.userAddEdit.synologyChat')"
                prepend-inner-icon="mdi-message"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.settings.douban_userid"
                density="comfortable"
                clearable
                label="豆瓣用户"
                prepend-inner-icon="mdi-movie"
              />
            </VCol>
          </VRow>
          <VDivider class="my-10" v-if="canControl">
            <span>{{ t('dialog.userAddEdit.permissions.title') }}</span>
          </VDivider>
          <!-- 权限设置 -->
          <div v-if="canControl" class="user-permission-editor">
            <div class="permission-section-header">
              <div>
                <div class="text-subtitle-1 font-weight-medium">
                  {{ t('dialog.userAddEdit.permissions.categoryTitle') }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  {{ t('dialog.userAddEdit.permissions.categoryHint') }}
                </div>
              </div>
              <VChip size="small" color="primary" variant="tonal">
                {{
                  t('dialog.userAddEdit.permissions.summary', {
                    categories: enabledCategoryCount,
                    features: enabledFeatureCount,
                  })
                }}
              </VChip>
            </div>

            <div class="permission-category-grid">
              <div
                v-for="option in permissionOptions"
                :key="option.key"
                role="button"
                tabindex="0"
                class="permission-category-option"
                :class="{
                  'is-active': activePermissionCategory === option.key,
                  'is-enabled': userPermissions[option.key],
                  'is-partial': isPermissionPartiallySelected(option.key),
                }"
                @click="selectPermissionCategory(option.key)"
                @keydown.enter="selectPermissionCategory(option.key)"
                @keydown.space.prevent="selectPermissionCategory(option.key)"
              >
                <span class="permission-category-option__icon">
                  <VIcon :icon="option.icon" size="20" />
                </span>
                <span class="permission-category-option__body">
                  <span class="permission-category-option__title-row">
                    <span class="permission-category-option__title">{{ option.title }}</span>
                    <span class="permission-category-option__count">
                      {{ getEnabledFeatureCount(option.key) }}/{{ getFeatureTotalCount(option.key) }}
                    </span>
                  </span>
                  <span class="permission-category-option__desc">{{ option.description }}</span>
                </span>
                <VBtn
                  :icon="userPermissions[option.key] ? 'mdi-check-circle' : 'mdi-circle-outline'"
                  :color="userPermissions[option.key] ? 'primary' : 'secondary'"
                  variant="text"
                  size="small"
                  class="permission-category-option__toggle"
                  @click.stop="togglePermission(option.key)"
                />
              </div>
            </div>

            <div class="permission-feature-panel">
              <div class="permission-feature-panel__header">
                <div>
                  <div class="text-subtitle-1 font-weight-medium">
                    {{ activePermissionOption.title }}{{ t('dialog.userAddEdit.permissions.featureTitleSuffix') }}
                  </div>
                  <div class="text-caption text-medium-emphasis">
                    {{
                      userPermissions[activePermissionCategory]
                        ? t('dialog.userAddEdit.permissions.featureHint')
                        : t('dialog.userAddEdit.permissions.disabledCategoryHint')
                    }}
                  </div>
                </div>
                <div class="permission-feature-panel__actions">
                  <VBtn
                    size="small"
                    color="primary"
                    variant="tonal"
                    :disabled="!userPermissions[activePermissionCategory]"
                    @click="setCategoryFeatures(activePermissionCategory, true)"
                  >
                    {{ t('dialog.userAddEdit.permissions.selectAll') }}
                  </VBtn>
                  <VBtn
                    size="small"
                    variant="outlined"
                    :disabled="!userPermissions[activePermissionCategory]"
                    @click="setCategoryFeatures(activePermissionCategory, false)"
                  >
                    {{ t('dialog.userAddEdit.permissions.clear') }}
                  </VBtn>
                  <VBtn
                    size="small"
                    variant="outlined"
                    :disabled="!userPermissions[activePermissionCategory]"
                    @click="resetCategoryFeatures(activePermissionCategory)"
                  >
                    {{ t('dialog.userAddEdit.permissions.default') }}
                  </VBtn>
                </div>
              </div>

              <div class="permission-feature-list">
                <div
                  v-for="feature in activePermissionFeatures"
                  :key="feature.key"
                  role="checkbox"
                  :aria-checked="isFeatureEnabled(feature.key)"
                  :aria-disabled="!userPermissions[activePermissionCategory]"
                  :tabindex="userPermissions[activePermissionCategory] ? 0 : -1"
                  class="permission-feature-item"
                  :class="{
                    'is-enabled': isFeatureEnabled(feature.key),
                    'is-disabled': !userPermissions[activePermissionCategory],
                  }"
                  @click="userPermissions[activePermissionCategory] && togglePermissionFeature(feature.key)"
                  @keydown.enter="userPermissions[activePermissionCategory] && togglePermissionFeature(feature.key)"
                  @keydown.space.prevent="userPermissions[activePermissionCategory] && togglePermissionFeature(feature.key)"
                >
                  <VCheckboxBtn
                    :model-value="isFeatureEnabled(feature.key)"
                    :disabled="!userPermissions[activePermissionCategory]"
                    color="primary"
                    density="compact"
                    class="permission-feature-item__check"
                    @click.stop
                    @update:model-value="togglePermissionFeature(feature.key)"
                  />
                  <span class="permission-feature-item__icon">
                    <VIcon :icon="feature.icon" size="20" />
                  </span>
                  <span class="permission-feature-item__body">
                    <span class="permission-feature-item__title">{{ feature.title }}</span>
                    <span class="permission-feature-item__desc">{{ feature.description }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </VForm>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          v-if="props.oper === 'add'"
          :disabled="isAdding"
          color="primary"
          variant="flat"
          @click="addUser"
          prepend-icon="mdi-plus"
          class="px-5"
        >
          <span v-if="isAdding">{{ t('common.loading') }}</span>
          <span v-else>{{ t('common.add') }}</span>
        </VBtn>
        <VBtn
          v-else
          :disabled="isUpdating"
          color="primary"
          variant="flat"
          @click="updateUser"
          prepend-icon="mdi-content-save"
          class="px-5"
        >
          <span v-if="isUpdating">{{ t('common.loading') }}</span>
          <span v-else>{{ t('common.save') }}</span>
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
.user-permission-editor {
  --permission-editor-radius: min(var(--app-surface-radius, 8px), 8px);
  --permission-editor-border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  --permission-editor-muted-border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  --permission-editor-panel-bg: rgb(var(--v-theme-surface));
  --permission-editor-hover-bg: rgba(var(--v-theme-primary), 0.04);
  --permission-editor-active-bg: rgba(var(--v-theme-primary), 0.1);
  --permission-editor-selected-bg: rgba(var(--v-theme-primary), 0.08);

  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.permission-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.permission-category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15.5rem, 1fr));
  gap: 0.75rem;
}

.permission-category-option,
.permission-feature-item {
  border: var(--permission-editor-muted-border);
  border-radius: var(--permission-editor-radius);
  background: var(--permission-editor-panel-bg);
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease, opacity 0.18s ease;
}

.permission-category-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: flex-start;
  min-block-size: 5.75rem;
  padding: 0.875rem;
  text-align: start;
}

.permission-category-option:hover,
.permission-feature-item:hover:not(.is-disabled) {
  border-color: rgba(var(--v-theme-primary), 0.36);
  background: var(--permission-editor-hover-bg);
}

.permission-category-option:focus-visible,
.permission-feature-item:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.72);
  outline-offset: 2px;
}

.permission-category-option.is-active {
  border-color: rgba(var(--v-theme-primary), 0.72);
  background: var(--permission-editor-active-bg);
}

.permission-category-option.is-enabled {
  border-color: rgba(var(--v-theme-primary), 0.34);
}

.permission-category-option.is-partial .permission-category-option__count {
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.12);
}

.permission-category-option__icon,
.permission-feature-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: var(--app-control-radius, 6px);
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.permission-category-option__icon {
  inline-size: 2.25rem;
  block-size: 2.25rem;
  margin-inline-end: 0.75rem;
}

.permission-category-option__body,
.permission-feature-item__body {
  min-inline-size: 0;
}

.permission-category-option__title-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.5rem;
  min-inline-size: 0;
}

.permission-category-option__title,
.permission-feature-item__title {
  display: block;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.permission-category-option__count {
  flex: 0 0 auto;
  border-radius: var(--app-control-radius, 6px);
  padding: 0.125rem 0.5rem;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.25rem;
}

.permission-category-option__desc,
.permission-feature-item__desc,
.permission-feature-item__scope {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
}

.permission-category-option__desc,
.permission-feature-item__desc {
  display: block;
  overflow: visible;
  line-height: 1.35;
  overflow-wrap: anywhere;
  white-space: normal;
}

.permission-category-option__toggle {
  margin-inline-start: 0.25rem;
}

.permission-feature-panel {
  overflow: hidden;
  border: var(--permission-editor-border);
  border-radius: var(--permission-editor-radius);
  background: rgb(var(--v-theme-surface));
}

.permission-feature-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-block-end: var(--permission-editor-muted-border);
}

.permission-feature-panel__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

.permission-feature-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.625rem;
  padding: 1rem;
}

.permission-feature-item {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: flex-start;
  min-block-size: 4rem;
  padding: 0.625rem 0.875rem;
  text-align: start;
}

.permission-feature-item.is-disabled {
  cursor: not-allowed;
}

.permission-feature-item.is-disabled .permission-feature-item__icon {
  opacity: 0.72;
}

.permission-feature-item.is-disabled .permission-feature-item__title,
.permission-feature-item.is-disabled .permission-feature-item__desc {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.permission-feature-item.is-enabled {
  background: var(--permission-editor-selected-bg);
}

.permission-feature-item__check {
  margin-inline-end: 0.5rem;
}

.permission-feature-item__icon {
  inline-size: 2rem;
  block-size: 2rem;
  margin-inline-end: 0.75rem;
}

.permission-feature-item__body {
  display: flex;
  flex-direction: column;
}

.permission-feature-item__scope {
  max-inline-size: 8rem;
  margin-inline-start: 1rem;
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}

@media (width <= 960px) {
  .permission-category-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .permission-feature-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .permission-section-header,
  .permission-feature-panel__header {
    flex-direction: column;
    align-items: stretch;
  }

  .permission-feature-panel__actions {
    justify-content: flex-start;
  }
}

@media (width <= 600px) {
  .user-permission-editor {
    gap: 0.875rem;
  }

  .permission-category-option {
    grid-template-columns: minmax(0, 1fr) auto;
    min-block-size: 3.75rem;
    padding: 0.75rem;
  }

  .permission-category-option__icon,
  .permission-category-option__desc {
    display: none;
  }

  .permission-category-option__toggle {
    margin-inline-start: 0.5rem;
  }

  .permission-feature-item {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .permission-feature-item__icon {
    display: none;
  }
}
</style>
