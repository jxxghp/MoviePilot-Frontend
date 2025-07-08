import { useI18n } from 'vue-i18n'

// 构建路由菜单，每次调用时使用当前的语言环境
export function getNavMenus() {
  const { t } = useI18n()

  return [
    {
      title: t('navItems.dashboard'),
      icon: 'mdi-home-outline',
      to: '/dashboard',
      header: t('menu.start'),
      admin: false,
      footer: true,
      permission: 'manage',
    },
    {
      title: t('navItems.searchResult'),
      icon: 'mdi-magnify',
      to: '/resource',
      header: t('menu.start'),
      admin: false,
      permission: 'search',
    },
    {
      title: t('navItems.recommend'),
      icon: 'mdi-star-outline',
      to: '/recommend',
      header: t('menu.discovery'),
      admin: false,
      footer: true,
      permission: 'discovery',
    },
    {
      title: t('navItems.explore'),
      icon: 'mdi-apple-safari',
      to: '/discover',
      header: t('menu.discovery'),
      admin: false,
      footer: true,
      permission: 'discovery',
    },
    {
      title: t('navItems.movie'),
      full_title: t('navItems.movieSubscribe'),
      icon: 'mdi-movie-open-outline',
      to: '/subscribe/movie',
      header: t('menu.subscribe'),
      admin: false,
      footer: false,
      permission: 'subscribe',
    },
    {
      title: t('navItems.tv'),
      full_title: t('navItems.tvSubscribe'),
      icon: 'mdi-television',
      to: '/subscribe/tv',
      header: t('menu.subscribe'),
      admin: false,
      footer: false,
      permission: 'subscribe',
    },
    {
      title: t('navItems.workflow'),
      full_title: t('navItems.workflow'),
      icon: 'mdi-state-machine',
      to: '/workflow',
      header: t('menu.subscribe'),
      admin: true,
      footer: false,
      permission: 'manage',
    },
    {
      title: t('navItems.calendar'),
      full_title: t('navItems.calendar'),
      icon: 'mdi-calendar',
      to: '/calendar',
      header: t('menu.subscribe'),
      admin: false,
      permission: 'subscribe',
    },
    {
      title: t('navItems.downloadManager'),
      icon: 'mdi-download-outline',
      to: '/downloading',
      header: t('menu.organize'),
      admin: false,
      permission: 'manage',
    },
    {
      title: t('navItems.mediaOrganize'),
      icon: 'mdi-folder-play-outline',
      to: '/history',
      header: t('menu.organize'),
      admin: true,
      permission: 'manage',
    },
    {
      title: t('navItems.fileManager'),
      icon: 'mdi-folder-multiple-outline',
      to: '/filemanager',
      header: t('menu.organize'),
      admin: true,
      permission: 'manage',
    },
    {
      title: t('navItems.pluginManager'),
      icon: 'mdi-apps',
      to: '/plugins',
      header: t('menu.system'),
      admin: true,
      permission: 'manage',
    },
    {
      title: t('navItems.siteManager'),
      icon: 'mdi-web',
      to: '/site',
      header: t('menu.system'),
      admin: true,
      permission: 'manage',
    },
    {
      title: t('navItems.userManager'),
      icon: 'mdi-account-group-outline',
      to: '/user',
      header: t('menu.system'),
      admin: true,
      permission: 'admin',
    },
    {
      title: t('navItems.settings'),
      icon: 'mdi-cog-outline',
      to: '/setting',
      header: t('menu.system'),
      admin: true,
      permission: 'admin',
    },
  ]
}

// 获取设置标签页
export function getSettingTabs() {
  const { t } = useI18n()

  return [
    {
      title: t('settingTabs.system.title'),
      icon: 'mdi-server-network',
      tab: 'system',
      description: t('settingTabs.system.description'),
    },
    {
      title: t('settingTabs.directory.title'),
      icon: 'mdi-folder',
      tab: 'directory',
      description: t('settingTabs.directory.description'),
    },
    {
      title: t('settingTabs.site.title'),
      icon: 'mdi-web',
      tab: 'site',
      description: t('settingTabs.site.description'),
    },
    {
      title: t('settingTabs.rule.title'),
      icon: 'mdi-filter',
      tab: 'rule',
      description: t('settingTabs.rule.description'),
    },
    {
      title: t('settingTabs.search.title'),
      icon: 'mdi-magnify',
      tab: 'search',
      description: t('settingTabs.search.description'),
    },
    {
      title: t('settingTabs.subscribe.title'),
      icon: 'mdi-rss',
      tab: 'subscribe',
      description: t('settingTabs.subscribe.description'),
    },
    {
      title: t('settingTabs.scheduler.title'),
      icon: 'mdi-list-box',
      tab: 'scheduler',
      description: t('settingTabs.scheduler.description'),
    },
    {
      title: t('settingTabs.cache.title'),
      icon: 'mdi-database',
      tab: 'cache',
      description: t('settingTabs.cache.description'),
    },
    {
      title: t('settingTabs.notification.title'),
      icon: 'mdi-bell',
      tab: 'notification',
      description: t('settingTabs.notification.description'),
    },
    {
      title: t('settingTabs.words.title'),
      icon: 'mdi-file-word-box',
      tab: 'words',
      description: t('settingTabs.words.description'),
    },
    {
      title: t('settingTabs.about.title'),
      icon: 'mdi-information',
      tab: 'about',
      description: t('settingTabs.about.description'),
    },
  ]
}

// 获取电影订阅标签页
export function getSubscribeMovieTabs() {
  const { t } = useI18n()

  return [
    {
      title: t('subscribeTabs.movie.mysub'),
      tab: 'mysub',
      icon: 'mdi-bell-check',
    },
    {
      title: t('subscribeTabs.movie.popular'),
      tab: 'popular',
      icon: 'mdi-fire',
    },
  ]
}

// 获取电视剧订阅标签页
export function getSubscribeTvTabs() {
  const { t } = useI18n()

  return [
    {
      title: t('subscribeTabs.tv.mysub'),
      tab: 'mysub',
      icon: 'mdi-bell-check',
    },
    {
      title: t('subscribeTabs.tv.popular'),
      tab: 'popular',
      icon: 'mdi-fire',
    },
    {
      title: t('subscribeTabs.tv.share'),
      tab: 'share',
      icon: 'mdi-share-variant',
    },
  ]
}

// 获取插件标签页
export function getPluginTabs() {
  const { t } = useI18n()

  return [
    {
      title: t('pluginTabs.installed'),
      tab: 'installed',
      icon: 'mdi-apps',
    },
    {
      title: t('pluginTabs.market'),
      tab: 'market',
      icon: 'mdi-shopping',
    },
  ]
}

// 获取发现标签页
export function getDiscoverTabs() {
  const { t } = useI18n()

  return [
    {
      name: t('discoverTabs.themoviedb'),
      tab: 'themoviedb',
      icon: 'themoviedb',
    },
    {
      name: t('discoverTabs.douban'),
      tab: 'douban',
      icon: 'douban',
    },
    {
      name: t('discoverTabs.bangumi'),
      tab: 'bangumi',
      icon: 'bangumi',
    },
  ]
}

// 获取工作流标签页
export function getWorkflowTabs() {
  const { t } = useI18n()

  return [
    {
      title: t('workflowTabs.list'),
      tab: 'list',
      icon: 'mdi-format-list-bulleted',
    },
    {
      title: t('workflowTabs.share'),
      tab: 'share',
      icon: 'mdi-share',
    },
  ]
}
