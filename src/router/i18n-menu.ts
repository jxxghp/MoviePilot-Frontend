import { useGlobalSettingsStore } from '@/stores'
import type { NavMenu, NavMenuTabItem } from '@/@layouts/types'
import type { Composer } from 'vue-i18n'
import { PERMISSION_FEATURE } from '@/utils/permission'

/** 构建当前语言与全局模式对应的主导航菜单。 */
export function getNavMenus(t: Composer['t']): NavMenu[] {
  const globalSettingsStore = useGlobalSettingsStore()

  // 检查是否为高级模式
  const isAdvancedMode = globalSettingsStore.get('ADVANCED_MODE') !== false

  return [
    {
      title: t('navItems.dashboard'),
      icon: 'mdi-home-outline',
      iconColor: 'primary',
      to: '/dashboard',
      header: t('menu.start'),
      admin: false,
      footer: true,
      permission: 'admin',
    },
    {
      title: t('navItems.searchResult'),
      icon: 'mdi-magnify',
      iconColor: 'info',
      to: '/resource',
      header: t('menu.start'),
      admin: false,
      permission: 'search',
      feature: PERMISSION_FEATURE.SEARCH_RESOURCE,
    },
    {
      title: t('navItems.recommend'),
      icon: 'mdi-star-outline',
      iconColor: 'primary',
      to: '/recommend',
      header: t('menu.discovery'),
      admin: false,
      footer: true,
      permission: 'discovery',
      feature: PERMISSION_FEATURE.DISCOVERY_RECOMMEND,
      tabs: getRecommendTabs(t),
    },
    {
      title: t('navItems.explore'),
      icon: 'mdi-apple-safari',
      iconColor: 'info',
      to: '/discover',
      header: t('menu.discovery'),
      admin: false,
      footer: true,
      permission: 'discovery',
      feature: PERMISSION_FEATURE.DISCOVERY_EXPLORE,
      tabs: getDiscoverTabs(t),
    },
    {
      title: t('navItems.movie'),
      full_title: t('navItems.movieSubscribe'),
      icon: 'mdi-movie-open-outline',
      iconColor: 'success',
      to: '/subscribe/movie',
      header: t('menu.subscribe'),
      admin: false,
      footer: false,
      permission: 'subscribe',
      feature: PERMISSION_FEATURE.SUBSCRIBE_MOVIE,
      tabs: getSubscribeMovieTabs(t),
    },
    {
      title: t('navItems.tv'),
      full_title: t('navItems.tvSubscribe'),
      icon: 'mdi-television',
      iconColor: 'warning',
      to: '/subscribe/tv',
      header: t('menu.subscribe'),
      admin: false,
      footer: false,
      permission: 'subscribe',
      feature: PERMISSION_FEATURE.SUBSCRIBE_TV,
      tabs: getSubscribeTvTabs(t),
    },
    {
      title: t('navItems.music'),
      full_title: t('navItems.musicSubscribe'),
      icon: 'mdi-music-note',
      iconColor: 'primary',
      to: '/subscribe/music',
      header: t('menu.subscribe'),
      admin: false,
      footer: false,
      permission: 'subscribe',
      feature: PERMISSION_FEATURE.SUBSCRIBE_MUSIC,
      tabs: getSubscribeMusicTabs(t),
    },
    {
      title: t('navItems.workflow'),
      full_title: t('navItems.workflow'),
      icon: 'mdi-state-machine',
      iconColor: 'primary',
      to: '/workflow',
      header: t('menu.subscribe'),
      admin: true,
      footer: false,
      permission: 'manage',
      feature: PERMISSION_FEATURE.MANAGE_WORKFLOW,
      tabs: getWorkflowTabs(t),
    },
    {
      title: t('navItems.calendar'),
      full_title: t('navItems.calendar'),
      icon: 'mdi-calendar',
      iconColor: 'info',
      to: '/calendar',
      header: t('menu.subscribe'),
      admin: false,
      permission: 'subscribe',
      feature: PERMISSION_FEATURE.SUBSCRIBE_CALENDAR,
    },
    {
      title: t('navItems.downloadManager'),
      icon: 'mdi-download-outline',
      iconColor: 'info',
      to: '/downloading',
      header: t('menu.organize'),
      admin: false,
      permission: 'manage',
      feature: PERMISSION_FEATURE.MANAGE_DOWNLOADING,
    },
    {
      title: t('navItems.mediaOrganize'),
      icon: 'mdi-folder-play-outline',
      iconColor: 'warning',
      to: '/history',
      header: t('menu.organize'),
      admin: true,
      permission: 'manage',
      feature: PERMISSION_FEATURE.MANAGE_HISTORY,
    },
    {
      title: t('navItems.fileManager'),
      icon: 'mdi-folder-multiple-outline',
      iconColor: 'success',
      to: '/filemanager',
      header: t('menu.organize'),
      admin: true,
      permission: 'manage',
      feature: PERMISSION_FEATURE.MANAGE_FILEMANAGER,
    },
    {
      title: t('navItems.pluginManager'),
      icon: 'mdi-puzzle-outline',
      iconColor: 'primary',
      to: '/plugins',
      header: t('menu.system'),
      admin: true,
      permission: 'admin',
      tabs: getPluginTabs(t),
    },
    {
      title: t('navItems.siteManager'),
      icon: 'mdi-web',
      iconColor: 'info',
      to: '/site',
      header: t('menu.system'),
      admin: true,
      permission: 'manage',
      feature: PERMISSION_FEATURE.MANAGE_SITE,
    },
    {
      title: t('navItems.userManager'),
      icon: 'mdi-account-group-outline',
      iconColor: 'success',
      to: '/user',
      header: t('menu.system'),
      admin: true,
      permission: 'admin',
    },
    ...(isAdvancedMode
      ? [
          {
            title: t('navItems.settings'),
            icon: 'mdi-cog-outline',
            iconColor: 'secondary',
            to: '/setting',
            header: t('menu.system'),
            admin: true,
            permission: 'admin',
            tabs: getSettingTabs(t),
          } as NavMenu,
        ]
      : []),
  ]
}

/** 返回推荐页可用的分类标签。 */
export function getRecommendTabs(t: Composer['t']): NavMenuTabItem[] {
  return [
    { title: t('recommend.all'), icon: 'mdi-filmstrip-box-multiple', tab: t('recommend.all') },
    { title: t('recommend.categoryMovie'), icon: 'mdi-movie', tab: t('recommend.categoryMovie') },
    { title: t('recommend.categoryTV'), icon: 'mdi-television-classic', tab: t('recommend.categoryTV') },
    { title: t('recommend.categoryAnime'), icon: 'mdi-animation', tab: t('recommend.categoryAnime') },
    { title: t('recommend.categoryMusic'), icon: 'mdi-music-note', tab: t('recommend.categoryMusic') },
    { title: t('recommend.categoryRankings'), icon: 'mdi-trophy', tab: t('recommend.categoryRankings') },
  ]
}

/** 返回系统设置页的配置标签。 */
export function getSettingTabs(t: Composer['t']): NavMenuTabItem[] {
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
      title: t('settingTabs.notification.title'),
      icon: 'mdi-bell',
      tab: 'notification',
      description: t('settingTabs.notification.description'),
    },
  ]
}

/** 返回电影订阅页的业务标签。 */
export function getSubscribeMovieTabs(t: Composer['t']): NavMenuTabItem[] {
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

/** 返回电视剧订阅页的业务标签。 */
export function getSubscribeTvTabs(t: Composer['t']): NavMenuTabItem[] {
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

/** 返回音乐订阅页的业务标签。 */
export function getSubscribeMusicTabs(t: Composer['t']): NavMenuTabItem[] {
  return [
    {
      title: t('subscribeTabs.music.mysub'),
      tab: 'mysub',
      icon: 'mdi-bell-check',
    },
  ]
}

/** 返回插件管理页的业务标签。 */
export function getPluginTabs(t: Composer['t']): NavMenuTabItem[] {
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

/** 返回发现页的媒体来源标签。 */
export function getDiscoverTabs(t: Composer['t']): NavMenuTabItem[] {
  return [
    {
      title: t('discoverTabs.themoviedb'),
      tab: 'themoviedb',
      icon: 'mdi-movie-search-outline',
    },
    {
      title: t('discoverTabs.douban'),
      tab: 'douban',
      icon: 'mdi-book-open-page-variant-outline',
    },
    {
      title: t('discoverTabs.bangumi'),
      tab: 'bangumi',
      icon: 'mdi-calendar-star-outline',
    },
    {
      title: t('discoverTabs.anilist'),
      tab: 'anilist',
      icon: 'mdi-alpha-a-circle-outline',
    },
    {
      title: t('discoverTabs.music'),
      tab: 'musicbrainz',
      icon: 'mdi-music-note-outline',
    },
  ]
}

/** 返回工作流页的业务标签。 */
export function getWorkflowTabs(t: Composer['t']): NavMenuTabItem[] {
  return [
    {
      title: t('workflowTabs.list'),
      tab: 'list',
      icon: 'mdi-workflow-outline',
    },
    {
      title: t('workflowTabs.share'),
      tab: 'share',
      icon: 'mdi-share-variant',
    },
  ]
}

/** 插件侧栏分组（与后端 get_sidebar_nav 的 section 一致） */
export type PluginSidebarSection = 'start' | 'discovery' | 'subscribe' | 'organize' | 'system'

/**
 * 将插件声明的 section 映射为与 getNavMenus 一致的已翻译 header（用于 NavMenu.header）
 */
export function pluginSidebarSectionToHeaderKey(section: string, t: Composer['t']): string {
  const map: Record<string, string> = {
    start: 'menu.start',
    discovery: 'menu.discovery',
    subscribe: 'menu.subscribe',
    organize: 'menu.organize',
    system: 'menu.system',
  }
  return t(map[section] ?? 'menu.system')
}
