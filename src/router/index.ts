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
        },
        {
          path: 'ranking',
          component: () => import('../pages/ranking.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'resources',
          component: () => import('../pages/resources.vue'),
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
          path: 'sites',
          component: () => import('../pages/sites.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'account-settings',
          component: () => import('../pages/account-settings.vue'),
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
  const isAuthenticated = checkLoginStatus() // 检查用户是否已登录
  if (to.meta.requiresAuth && !isAuthenticated) {
    // 如果路由需要登录权限且用户未登录，则跳转到登录页面
    next('/login')
  }
  else {
    // 否则，允许继续进行路由导航
    next()
  }
})

// 检查用户登录状态的函数
function checkLoginStatus() {
  // 在此处检查用户的登录状态，例如从本地存储中读取令牌或其他登录相关的信息
  const token = localStorage.getItem('token')

  return !!token // 返回一个布尔值，表示用户是否已登录
}

export default router
