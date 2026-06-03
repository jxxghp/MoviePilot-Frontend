<script setup lang="ts">
import { useAuthStore, useUserStore } from '@/stores'
import { authState, userState } from '@/stores/types'
import router from '@/router'
import { getNavMenus } from '@/router/i18n-menu'
import { filterMenusByPermission, DEFAULT_PERMISSIONS } from '@/utils/permission'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const authStore = useAuthStore()
const userStore = useUserStore()
const navMenus = computed(() => getNavMenus(t))

const errorMessage = ref('')

onMounted(async () => {
  try {
    // 从 URL 查询参数获取 token 和用户信息
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search)
    const token = urlParams.get('token')
    const error = urlParams.get('error')

    if (error) {
      // 处理各种错误
      let errorMsg = ''
      const rawMessage = urlParams.get('message') || ''
      switch (error) {
        case 'oidc_unbound':
          errorMsg = t('login.oidcUnbound')
          break
        case 'oidc_error':
          errorMsg = t('login.oidcError') + (rawMessage ? `: ${rawMessage}` : '')
          break
        case 'user_inactive':
          errorMsg = t('login.userInactive')
          break
        default:
          errorMsg = t('login.authFailure')
      }
      errorMessage.value = errorMsg

      // 通知父窗口错误信息（通过 postMessage + localStorage 双通道）
      const errorPayload = {
        type: 'oidc_callback',
        success: false,
        error,
        message: rawMessage,
      }
      if (window.opener) {
        try {
          window.opener.postMessage(errorPayload, '*')
        } catch (e) {
          // postMessage 失败，忽略
        }
      }
      // 使用 localStorage 作为备选通信方式
      localStorage.setItem('oidc_callback_error', JSON.stringify(errorPayload))
      window.close()

      // 如果弹窗未关闭（非弹窗模式），3秒后跳转登录页
      setTimeout(() => {
        if (!window.closed) {
          router.push('/login')
        }
      }, 3000)
      return
    }

    if (!token) {
      errorMessage.value = t('login.authFailure')
      setTimeout(() => router.push('/login'), 3000)
      return
    }

    // 解析用户信息
    const superUser = urlParams.get('super_user') === 'true' || urlParams.get('super_user') === '1'
    const userId = parseInt(urlParams.get('user_id') || '0')
    const userName = urlParams.get('user_name') || ''
    const avatar = urlParams.get('avatar') || ''
    const level = parseInt(urlParams.get('level') || '1')
    const wizard = urlParams.get('wizard') === 'true' || urlParams.get('wizard') === '1'
    const permissionsStr = urlParams.get('permissions')
    const permissions: Record<string, boolean> = permissionsStr ? JSON.parse(permissionsStr) : {}

    const userPayload: userState = {
      superUser,
      userID: userId,
      userName,
      avatar,
      level,
      permissions,
      wizard,
    }

    const userPermissions = {
      is_superuser: userPayload.superUser,
      ...DEFAULT_PERMISSIONS,
      ...userPayload.permissions,
    }

    const filteredMenus = filterMenusByPermission(navMenus.value, userPermissions)
    if (filteredMenus.length === 0) {
      errorMessage.value = t('login.noPermission')
      setTimeout(() => router.push('/login'), 3000)
      return
    }

    const authPayLoad: authState = {
      token,
      remember: true,
    }

    authStore.login(authPayLoad)
    userStore.loginUser(userPayload)

    const targetPath = wizard ? '/setup-wizard' : filteredMenus[0].to

    // 如果是弹窗打开的，尝试通知父窗口
    if (window.opener) {
      // postMessage 通知父窗口
      try {
        window.opener.postMessage({
          type: 'oidc_callback',
          success: true,
          data: {
            token,
            super_user: superUser,
            user_id: userId,
            user_name: userName,
            avatar,
            level,
            permissions,
            wizard,
          },
        }, '*')
      } catch (e) {
        // postMessage 失败，尝试让父窗口刷新以读取 localStorage 中的 token
        try {
          window.opener.location.reload()
        } catch (e2) {
          // 跨域无法刷新父窗口
        }
      }
      // 关闭弹窗
      window.close()
      // 如果 window.close() 被浏览器阻止，显示提示
      setTimeout(() => {
        document.body.innerHTML = '<p style="text-align:center;margin-top:40px;">登录成功，请手动关闭此窗口并刷新原页面</p>'
      }, 500)
    } else {
      // window.opener 为 null（跨域重定向后丢失），尝试关闭弹窗让父窗口通过 $hydrate 检测登录状态
      // 先尝试关闭弹窗
      window.close()
      // 如果 window.close() 被浏览器阻止（因为不是通过 window.open 打开的窗口），
      // 则在当前窗口跳转（非弹窗模式的直接访问场景）
      setTimeout(() => {
        // 如果弹窗仍未关闭，说明是非弹窗模式，正常跳转
        if (!window.closed) {
          router.push(targetPath)
        }
      }, 300)
    }
  } catch (e) {
    console.error('OIDC callback error:', e)
    errorMessage.value = t('login.authFailure')
    setTimeout(() => router.push('/login'), 3000)
  }
})
</script>

<template>
  <div class="relative flex min-h-screen flex-col items-center justify-center">
    <VCard class="pa-6" max-width="28rem" border>
      <VCardTitle class="text-center">
        <VIcon v-if="!errorMessage" icon="mdi-loading" class="animate-spin mr-2" />
        <VIcon v-else icon="mdi-alert-circle" color="error" class="mr-2" />
        {{ errorMessage ? t('login.authFailure') : t('login.loggingIn') }}
      </VCardTitle>
      <VCardText class="text-center">
        <p v-if="errorMessage" class="text-error">{{ errorMessage }}</p>
        <p v-else class="text-medium-emphasis">{{ t('login.pleaseWait') }}</p>
      </VCardText>
    </VCard>
  </div>
</template>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
