<script setup lang="ts">
import api from '@/api'
import { Subscribe, User } from '@/api/types'
import { useUserStore } from '@/stores'
import avatar1 from '@images/avatars/avatar-1.png'
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'

const UserAddEditDialog = defineAsyncComponent(() => import('@/components/dialog/UserAddEditDialog.vue'))

// 国际化
const { t } = useI18n()

// 扩展User类型以包含昵称字段
interface ExtendedUser extends User {
  nickname?: string
}

// 定义输入变量
const props = defineProps({
  // 用户信息
  user: {
    type: Object as PropType<ExtendedUser>,
    required: true,
  },
  // 所有用户
  users: {
    type: Array as PropType<User[]>,
    required: true,
  },
})

const display = useDisplay()
const isMobile = computed(() => display.mdAndDown.value)

// 当前用户的ID
const currentLoginUserId = computed(() => useUserStore().userID)

// 当前用户是否是管理员
const currentUserIsSuperuser = computed(() => useUserStore().superUser)

// 定义触发的自定义事件
const emit = defineEmits(['remove', 'save'])

// 确认框
const createConfirm = useConfirm()

// 提示框
const $toast = useToast()

// 用户电影订阅数量
const movieSubscriptions = ref(0)

// 用户电视剧订阅数量
const tvShowSubscriptions = ref(0)

// 显示名称 - 如果有昵称则优先显示昵称
const displayName = computed(() => {
  const settingsNickname = props.user.settings?.nickname as string | undefined
  const nickname = props.user.nickname || settingsNickname
  return nickname || props.user.name
})

// 按用户查询订阅数量
async function fetchSubscriptions() {
  try {
    const result: Subscribe[] = await api.get(`subscribe/user/${props.user.name}`)
    if (result) {
      movieSubscriptions.value = result.filter(item => item.type === '电影').length
      tvShowSubscriptions.value = result.filter(item => item.type === '电视剧').length
    }
  } catch (error) {
    console.log(error)
  }
}

// 删除用户
async function removeUser() {
  if (props.user.id === currentLoginUserId.value) {
    $toast.error(t('user.cannotDeleteCurrentUser'))
    return
  }
  try {
    const isConfirmed = await createConfirm({
      title: t('common.confirm'),
      content: t('user.confirmDeleteUser', { username: props.user?.name }),
    })
    if (!isConfirmed) return
    const result: { [key: string]: any } = await api.delete(`user/id/${props.user.id}`)
    if (result.success) {
      $toast.success(t('user.deleteSuccess'))
      emit('remove')
    } else {
      $toast.error(t('user.deleteFailed'))
    }
  } catch (error) {
    console.log(error)
  }
}

// 编辑用户
function editUser() {
  openSharedDialog(
    UserAddEditDialog,
    {
      username: props.user?.name,
      usernames: props.users.map(item => item.name),
      oper: 'edit',
    },
    {
      save: onUserUpdate,
    },
    { closeOn: ['close', 'save'] },
  )
}

// 用户更新完成时
function onUserUpdate() {
  emit('save')
}

onMounted(() => {
  fetchSubscriptions()
})
</script>
<template>
  <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
  <div class="user-card-hover-area h-full">
    <VCard
      :class="[
        'app-hover-lift-card',
        !props.user.is_active ? 'opacity-85 bg-surface-lighten-1' : '',
      ]"
      class="user-card flex flex-column h-full"
      @click="editUser"
    >
    <div class="user-card__body flex-grow flex-grow-1">
      <!-- 用户头像和基本信息 -->
      <VCardItem :class="[user.is_superuser ? 'admin-header' : '']">
        <template v-slot:prepend>
          <div class="position-relative mr-4">
            <VAvatar
              size="72"
              rounded="lg"
              :class="[
                user.is_superuser ? 'admin-avatar' : 'border-4 bg-surface',
                !user.is_active ? 'grayscale-50 opacity-90' : '',
              ]"
              :style="user.is_superuser ? 'border: 4px solid rgba(var(--v-theme-warning), 0.3);' : ''"
            >
              <VImg :src="user.avatar || avatar1" :alt="user.name" />
              <div
                v-if="!user.is_active"
                class="position-absolute d-flex align-center justify-center rounded-lg bg-surface-variant opacity-20"
                style="inset: 0"
              >
                <VIcon icon="mdi-account-lock" color="white" />
              </div>
            </VAvatar>
            <div v-if="user.is_superuser" class="admin-crown">
              <VIcon icon="mdi-crown" color="warning" />
            </div>
          </div>
        </template>

        <VCardTitle class="pa-0 d-flex flex-column">
          <div class="d-flex flex-column mb-1">
            <div class="d-flex align-center">
              <span
                :class="[
                  'text-h6 font-weight-bold truncate',
                  user.is_superuser ? 'text-warning' : '',
                  !user.is_active ? 'text-medium-emphasis' : '',
                ]"
              >
                {{ displayName }}
                <VIcon
                  v-if="user.nickname || user.settings?.nickname"
                  icon="mdi-format-quote-close"
                  size="x-small"
                  color="info"
                  class="animate-pulse"
                />
              </span>
            </div>
            <div class="d-flex flex-wrap gap-1 overflow-auto">
              <VChip v-if="user.is_superuser" size="x-small" color="error" variant="outlined" label>{{
                t('user.admin')
              }}</VChip>
              <VChip v-else size="x-small" label>{{ t('user.normal') }}</VChip>
              <VChip size="x-small" :color="user.is_active ? 'success' : 'grey'" variant="tonal" label>
                {{ user.is_active ? t('user.active') : t('user.inactive') }}
              </VChip>
              <VChip v-if="user.is_otp" size="x-small" color="info" variant="tonal" label>2FA</VChip>
            </div>
          </div>

          <!-- 移动端订阅数据信息 -->
          <div v-if="isMobile" class="d-flex gap-5 mt-2">
            <div class="d-flex align-center">
              <VIcon size="x-small" icon="mdi-movie-outline" color="primary" class="mr-1" />
              <span class="text-body-2">{{ movieSubscriptions }}</span>
            </div>
            <div class="d-flex align-center">
              <VIcon size="x-small" icon="mdi-television-classic" color="primary" class="mr-1" />
              <span class="text-body-2">{{ tvShowSubscriptions }}</span>
            </div>
          </div>
        </VCardTitle>

        <!-- 头部操作按钮 -->
        <template v-slot:append>
          <div :class="['d-flex', isMobile ? 'position-absolute top-2 right-2' : '']">
            <VBtn
              icon
              size="small"
              :color="user.is_superuser ? 'warning' : 'primary'"
              variant="text"
              class="opacity-70 hover:opacity-100 transition-opacity"
              @click.stop="editUser"
            >
              <VIcon icon="mdi-pencil" />
            </VBtn>

            <VBtn
              v-if="props.user.id != currentLoginUserId && currentUserIsSuperuser"
              icon
              size="small"
              color="error"
              variant="text"
              class="opacity-70 hover:opacity-100 transition-opacity"
              @click.stop="removeUser"
            >
              <VIcon icon="mdi-delete" />
            </VBtn>
          </div>
        </template>
      </VCardItem>

      <!-- 权限显示 -->
      <div v-if="!user.is_superuser && user.permissions" class="d-flex flex-wrap gap-1 px-7 pb-3">
        <VChip v-if="user.permissions.discovery" size="x-small" color="purple" variant="outlined" label>
          {{ t('dialog.userAddEdit.permissions.discovery') }}
        </VChip>
        <VChip v-if="user.permissions.search" size="x-small" color="blue" variant="outlined" label>
          {{ t('dialog.userAddEdit.permissions.search') }}
        </VChip>
        <VChip v-if="user.permissions.subscribe" size="x-small" color="green" variant="outlined" label>
          {{ t('dialog.userAddEdit.permissions.subscribe') }}
        </VChip>
        <VChip v-if="user.permissions.manage" size="x-small" color="orange" variant="outlined" label>
          {{ t('dialog.userAddEdit.permissions.manage') }}
        </VChip>
      </div>
    </div>
    <!-- 独立的邮箱显示 -->
    <VDivider class="mx-4" />
    <div class="user-card__footer">
      <VCardText class="d-flex align-center py-2 px-4 text-medium-emphasis">
        <VIcon icon="mdi-email-outline" size="small" color="primary" class="mr-2 opacity-70" />
        <span class="text-body-2 truncate">{{ user.email || t('user.noEmail') }}</span>
      </VCardText>

      <!-- PC端显示订阅统计信息 -->
      <VCardText v-if="!isMobile" class="px-4 pt-0 pb-4">
        <div rounded="lg" class="d-flex justify-space-around">
          <div class="d-flex align-center gap-3">
            <VAvatar
              tile
              rounded="lg"
              size="large"
              class="mr-1"
              :class="user.is_superuser ? 'admin-stats-container' : 'user-stats-container'"
            >
              <div :class="['d-flex align-center justify-center rounded-lg w-10 h-10']">
                <VIcon :color="user.is_superuser ? 'warning' : 'primary'" icon="mdi-movie-outline" size="20" />
              </div>
            </VAvatar>
            <div class="d-flex flex-column">
              <span class="text-lg text-medium-emphasis font-weight-bold">{{ movieSubscriptions }}</span>
              <span class="text-caption text-medium-emphasis">{{ t('user.movieSubscriptions') }}</span>
            </div>
          </div>
          <div class="d-flex align-center gap-3">
            <VAvatar
              tile
              rounded="lg"
              size="large"
              class="mr-1"
              :class="user.is_superuser ? 'admin-stats-container' : 'user-stats-container'"
            >
              <div :class="['d-flex align-center justify-center rounded-lg w-10 h-10']">
                <VIcon :color="user.is_superuser ? 'warning' : 'primary'" icon="mdi-television-classic" />
              </div>
            </VAvatar>
            <div class="d-flex flex-column">
              <span class="text-lg text-medium-emphasis">{{ tvShowSubscriptions }}</span>
              <span class="text-caption text-medium-emphasis">{{ t('user.tvSubscriptions') }}</span>
            </div>
          </div>
        </div>
      </VCardText>
    </div>
    </VCard>
  </div>
</template>

<style scoped>
.user-card-hover-area {
  inline-size: 100%;
}

.user-card-hover-area:hover .user-card {
  transform: translate3d(0, -0.25rem, 0);
}

.user-card {
  block-size: 100%;
}

/* 让邮箱和订阅统计固定在卡片底部，保证同一行用户卡片视觉等高。 */
.user-card__footer {
  flex-shrink: 0;
  margin-block-start: auto;
}

.admin-decoration {
  position: absolute;
  z-index: 1;
  display: flex;
  align-items: center;
  inline-size: 100%;
  inset-block-start: 0;
  padding-block: 8px;
  padding-inline: 12px;
}

.admin-header {
  background: linear-gradient(to bottom, rgba(var(--v-theme-warning), 0.05), transparent);
}

.admin-avatar::after {
  position: absolute;
  border: 1px solid rgba(var(--v-theme-warning), 0.3);
  border-radius: 12px;
  animation: pulse 2.5s infinite;
  content: '';
  inset: -5px;
  pointer-events: none;
}

.admin-stats-container {
  background-color: rgba(var(--v-theme-warning), 0.1);
}

.user-stats-container {
  background-color: rgba(var(--v-theme-primary), 0.1);
}

@keyframes pulse {
  0% {
    opacity: 0.6;
    transform: scale(0.95);
  }

  70% {
    opacity: 0.2;
    transform: scale(1.05);
  }

  100% {
    opacity: 0.6;
    transform: scale(0.95);
  }
}

.admin-crown {
  position: absolute;
  z-index: 5;
  animation: float 3s ease-in-out infinite;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 40%));
  inset-block-start: -10px;
  inset-inline-start: -6px;
  transform: rotate(-25deg);
}

@keyframes float {
  0% {
    transform: rotate(-25deg) translateY(0);
  }

  50% {
    transform: rotate(-25deg) translateY(-3px);
  }

  100% {
    transform: rotate(-25deg) translateY(0);
  }
}

.animate-pulse {
  animation: pulse-nickname 2s ease infinite;
}

@keyframes pulse-nickname {
  0%,
  100% {
    opacity: 0.9;
    transform: scale(1);
  }

  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

.grayscale-50 {
  filter: grayscale(50%);
}
</style>
