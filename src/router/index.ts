import { createRouter, createWebHashHistory } from 'vue-router'
import { configureNProgress } from '@/api/nprogress'
import { useAuthStore, usePluginSidebarNavStore, useUserStore } from '@/stores'
import { setNavigatingState as setRequestNavigatingState } from '@/utils/requestOptimizer'
import { buildUserPermissionContext, hasPermission, type UserPermissionKey } from '@/utils/permission'

// Nprogress
configureNProgress()

// Router
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  scrollBehavior(to: any, from: any, savedPosition: any) {
    // 如果页面有缓存那么恢复其位置, 否则始终滚动到顶部
    if (to.meta.keepAlive && savedPosition) return savedPosition
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      redirect: () => {
        const authStore = useAuthStore()
        const userStore = useUserStore()
        if (!authStore.token) return '/login'
        return userStore.superUser ? '/dashboard' : '/apps'
      },
    },
    {
      path: '/',
      component: () => import('../layouts/default.vue'),
      children: [
        {
          path: '/dashboard',
          component: () => import('../pages/dashboard.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'admin',
          },
        },
        {
          path: '/recommend',
          component: () => import('../pages/recommend.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'discovery',
          },
        },
        {
          path: '/discover',
          component: () => import('../pages/discover.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'discovery',
          },
        },
        {
          path: '/resource',
          component: () => import('../pages/resource.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'search',
          },
        },
        {
          path: '/subscribe/movie',
          component: () => import('../pages/subscribe.vue'),
          meta: {
            keepAlive: true,
            keepAliveKey: 'subscribe-movie',
            requiresAuth: true,
            permission: 'subscribe',
            subType: '电影',
          },
        },
        {
          path: '/subscribe/tv',
          component: () => import('../pages/subscribe.vue'),
          meta: {
            keepAlive: true,
            keepAliveKey: 'subscribe-tv',
            requiresAuth: true,
            permission: 'subscribe',
            subType: '电视剧',
          },
        },
        {
          path: '/subscribe-share',
          component: () => import('../pages/subscribe-share.vue'),
          meta: {
            requiresAuth: true,
            permission: 'subscribe',
          },
        },
        {
          path: '/workflow',
          component: () => import('../pages/workflow.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'manage',
          },
        },
        {
          path: '/calendar',
          component: () => import('../pages/calendar.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'subscribe',
          },
        },
        {
          path: '/downloading',
          component: () => import('../pages/downloading.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'manage',
          },
        },
        {
          path: '/history',
          component: () => import('../pages/history.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'manage',
            hideFooter: true,
          },
        },
        {
          path: '/site',
          component: () => import('../pages/site.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'manage',
          },
        },
        {
          path: '/user',
          component: () => import('../pages/user.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'admin',
          },
        },
        {
          path: '/profile',
          component: () => import('../pages/profile.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
          },
        },
        {
          path: '/plugins',
          component: () => import('../pages/plugin.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'admin',
          },
        },
        {
          path: '/plugin-app/:pluginId/:navKey?',
          name: 'plugin-app',
          component: () => import('../pages/plugin-app.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: '/setting',
          component: () => import('../pages/setting.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'admin',
          },
        },
        {
          path: '/browse/:paths+',
          component: () => import('../pages/browse.vue'),
          props: true,
          meta: {
            requiresAuth: true,
            permission: 'discovery',
          },
        },
        {
          path: '/credits/:paths+',
          component: () => import('../pages/credits.vue'),
          props: true,
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: '/person',
          component: () => import('../pages/person.vue'),
          props: true,
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: '/media',
          component: () => import('../pages/media.vue'),
          meta: {
            requiresAuth: true,
            permission: 'discovery',
          },
        },
        {
          path: '/filemanager',
          component: () => import('../pages/filemanager.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
            permission: 'manage',
            hideFooter: true,
          },
        },
        {
          path: '/apps',
          component: () => import('../pages/appcenter.vue'),
          meta: {
            keepAlive: true,
            requiresAuth: true,
          },
        },
      ],
    },
    {
      path: '/',
      component: () => import('../layouts/blank.vue'),
      children: [
        {
          path: 'login',
          component: () => import('../pages/login.vue'),
        },
        {
          path: 'setup-wizard',
          component: () => import('../pages/setup.vue'),
          meta: {
            requiresAuth: true,
            permission: 'admin',
          },
        },
        {
          path: '/:pathMatch(.*)*',
          component: () => import('../pages/[...all].vue'),
        },
      ],
    },
  ],
})

async function getRoutePermission(to: any): Promise<UserPermissionKey | undefined> {
  if (to.meta.permission) {
    return to.meta.permission as UserPermissionKey
  }

  if (to.name !== 'plugin-app') {
    return undefined
  }

  const pluginId = String(to.params.pluginId || '')
  const navKey = String(to.params.navKey || 'main')
  const pluginSidebarNavStore = usePluginSidebarNavStore()
  await pluginSidebarNavStore.ensureSidebarNav()

  const navItem = pluginSidebarNavStore.items.find(item => item.plugin_id === pluginId && item.nav_key === navKey)
  return (navItem?.permission || undefined) as UserPermissionKey | undefined
}

// 路由导航守卫
router.beforeEach(async (to: any, from: any, next: any) => {
  // 设置导航状态 - 同时中断API请求
  setRequestNavigatingState(true)

  // 认证 Store
  const authStore = useAuthStore()
  // 总是记录非login路由
  if (to.fullPath != '/login') authStore.originalPath = to.fullPath
  const isAuthenticated = authStore.token !== null

  if (to.meta.requiresAuth && !isAuthenticated) {
    // 用户未登录，重定向到登录页
    setRequestNavigatingState(false)
    next('/login')
  } else if (to.meta.requiresAuth) {
    const routePermission = await getRoutePermission(to)
    if (!routePermission) {
      next()
      return
    }

    const userStore = useUserStore()
    const allowed = hasPermission(
      buildUserPermissionContext(userStore.superUser, userStore.permissions),
      routePermission,
    )
    if (!allowed) {
      setRequestNavigatingState(false)
      next('/apps')
      return
    }
    next()
  } else {
    next()
  }
})

// 路由导航完成后
router.afterEach(() => {
  setTimeout(() => {
    setRequestNavigatingState(false)
  }, 100)
})

// 导出默认对象
export default router
