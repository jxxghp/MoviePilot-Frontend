import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    // 如果页面有缓存那么恢复其位置, 否则始终滚动到顶部
    if (to.meta.keepAlive && savedPosition)
      return savedPosition
    // console.log('top: 0')
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
            keepAlive: true,
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
          path: 'plugins',
          component: () => import('../pages/plugin.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: 'setting',
          component: () => import('../pages/setting.vue'),
          meta: {
            requiresAuth: true,
          },
        },
        {
          path: '/browse/:paths+',
          component: () => import('../pages/browse.vue'),
          props: true,
          meta: {
            requiresAuth: true,
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
          },
        },
        {
          path: '/filemanager',
          component: () => import('../pages/filemanager.vue'),
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
