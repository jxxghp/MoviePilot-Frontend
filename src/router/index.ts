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
          component: () => import('../pages/dashboard.vue')
        },
        {
          path: 'account-settings',
          component: () => import('../pages/account-settings.vue'),
          meta: {
            requiresAuth: true
          }
        },
        {
          path: 'typography',
          component: () => import('../pages/typography.vue'),
          meta: {
            requiresAuth: true
          }
        },
        {
          path: 'icons',
          component: () => import('../pages/icons.vue'),
          meta: {
            requiresAuth: true
          }
        },
        {
          path: 'cards',
          component: () => import('../pages/cards.vue'),
          meta: {
            requiresAuth: true
          }
        },
        {
          path: 'tables',
          component: () => import('../pages/tables.vue'),
          meta: {
            requiresAuth: true
          }
        },
        {
          path: 'form-layouts',
          component: () => import('../pages/form-layouts.vue'),
          meta: {
            requiresAuth: true
          }
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
  } else {
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
