import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    // 始终滚动到顶部
    return { top: 0 }
  },
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
          path: 'resource/:keyword+',
          component: () => import('../pages/resource.vue'),
          props: true,
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
        {
          path: '/browse/:type+',
          component: () => import('../pages/browse.vue'),
          props: true,
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
          path: '/:pathMatch(.*)*',
          component: () => import('../pages/[...all].vue'),
        },
      ],
    },
  ],
})

export default router
