import store from '@/store'
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/dashboard' },
    {
      path: '/',
      component: () => import('../layouts/default.vue'),
      children: [
        {
          path: 'dashboard',
          component: () => import('../pages/dashboard.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'ranking',
          component: () => import('../pages/ranking.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'resource',
          component: () => import('../pages/resource.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'subscribe-movie',
          component: () => import('../pages/subscribe-movie.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'subscribe-tv',
          component: () => import('../pages/subscribe-tv.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'calendar',
          component: () => import('../pages/calendar.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'downloading',
          component: () => import('../pages/downloading.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'history',
          component: () => import('../pages/history.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'site',
          component: () => import('../pages/site.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'plugin',
          component: () => import('../pages/plugin.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'account-setting',
          component: () => import('../pages/account-setting.vue'),
          meta: {
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
          path: 'register',
          component: () => import('../pages/register.vue'),
        },
        {
          path: '/:pathMatch(.*)*',
          component: () => import('../pages/[...all].vue'),
        },
      ],
    },
  ],
})

// 导航守卫
router.beforeEach((to, from, next) => {
  // 通过 Vuex Store 检查用户是否已登录
  const isAuthenticated = store.state.auth.token !== null
  if (to.meta.requiresAuth && !isAuthenticated) {
    // 如果路由需要登录权限且用户未登录，则跳转到登录页面
    next('/login')
  }
  else {
    // 否则，允许继续进行路由导航
    next()
  }
})

export default router
