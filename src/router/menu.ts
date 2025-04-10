// 导般菜单
export const SystemNavMenus = [
  {
    title: '仪表板',
    icon: 'mdi-home-outline',
    to: '/dashboard',
    header: '开始',
    admin: false,
    footer: true,
  },
  {
    title: '搜索结果',
    icon: 'mdi-magnify',
    to: '/resource',
    header: '开始',
    admin: false,
  },
  {
    title: '推荐',
    icon: 'mdi-star-outline',
    to: '/recommend',
    header: '发现',
    admin: false,
    footer: true,
  },
  {
    title: '探索',
    icon: 'mdi-apple-safari',
    to: '/discover',
    header: '发现',
    admin: false,
    footer: false,
  },
  {
    title: '电影',
    full_title: '电影订阅',
    icon: 'mdi-movie-open-outline',
    to: '/subscribe/movie',
    header: '订阅',
    admin: false,
    footer: true,
    hidden: true,
  },
  {
    title: '电视剧',
    full_title: '电视剧订阅',
    icon: 'mdi-television',
    to: '/subscribe/tv',
    header: '订阅',
    admin: false,
    footer: true,
    hidden: true,
  },

  {
    title: '工作流',
    full_title: '工作流',
    icon: 'mdi-state-machine',
    to: '/workflow',
    header: '订阅',
    admin: true,
    footer: false,
  },
  {
    title: '日历',
    full_title: '订阅日历',
    icon: 'mdi-calendar',
    to: '/calendar',
    header: '订阅',
    admin: false,
    hidden: true,
  },
  {
    title: '下载管理',
    icon: 'mdi-download-outline',
    to: '/downloading',
    header: '整理',
    admin: false,
  },
  {
    title: '媒体整理',
    icon: 'mdi-folder-play-outline',
    to: '/history',
    header: '整理',
    admin: true,
  },
  {
    title: '文件管理',
    icon: 'mdi-folder-multiple-outline',
    to: '/filemanager',
    header: '整理',
    admin: true,
  },
  {
    title: '插件',
    icon: 'mdi-puzzle-outline',
    to: '/plugins',
    header: '系统',
    admin: true,
  },
  {
    title: '站点管理',
    icon: 'mdi-web',
    to: '/site',
    header: '系统',
    admin: true,
  },
  {
    title: '用户管理',
    icon: 'mdi-account-group-outline',
    to: '/user',
    header: '系统',
    admin: true,
  },
  {
    title: '设定',
    icon: 'mdi-cog-outline',
    to: '/setting',
    header: '系统',
    admin: true,
  },
]

// 设定标签页
export const SettingTabs = [
  {
    title: '系统',
    icon: 'mdi-server-network',
    tab: 'system',
    description: '基础设置、下载器（Qbittorrent、Transmission）、媒体服务器（Emby、Jellyfin、Plex）',
  },
  {
    title: '存储 & 目录',
    icon: 'mdi-folder',
    tab: 'directory',
    description: '下载目录、媒体库目录、整理、刮削',
  },
  {
    title: '站点',
    icon: 'mdi-web',
    tab: 'site',
    description: '站点同步、站点数据刷新、站点重置',
  },
  {
    title: '规则',
    icon: 'mdi-filter',
    tab: 'rule',
    description: '自定义规则、优先级规则组、下载规则',
  },
  {
    title: '搜索 & 下载',
    icon: 'mdi-magnify',
    tab: 'search',
    description: '搜索数据源（TheMovieDb、豆瓣、Bangumi）、下载任务标签、搜索站点',
  },
  {
    title: '订阅',
    icon: 'mdi-rss',
    tab: 'subscribe',
    description: '订阅站点、订阅模式、订阅规则、洗版规则',
  },
  {
    title: '服务',
    icon: 'mdi-list-box',
    tab: 'scheduler',
    description: '定时作业',
  },
  {
    title: '通知',
    icon: 'mdi-bell',
    tab: 'notification',
    description: '通知渠道（微信、Telegram、Slack、SynologyChat、VoceChat、WebPush）、消息发送范围',
  },
  {
    title: '词表',
    icon: 'mdi-file-word-box',
    tab: 'words',
    description: '自定义识别词、自定义制作组/字幕组、自定义占位符、文件整理屏蔽词',
  },
  {
    title: '关于',
    icon: 'mdi-information',
    tab: 'about',
    description: '软件版本',
  },
]

// 电影订阅标签页
export const SubscribeMovieTabs = [
  {
    title: '我的订阅',
    tab: 'mysub',
    icon: 'mdi-bell-check',
  },
  {
    title: '热门订阅',
    tab: 'popular',
    icon: 'mdi-fire',
  },
]

// 电视剧订阅标签页
export const SubscribeTvTabs = [
  {
    title: '我的订阅',
    tab: 'mysub',
    icon: 'mdi-bell-check',
  },
  {
    title: '热门订阅',
    tab: 'popular',
    icon: 'mdi-fire',
  },
  {
    title: '订阅分享',
    tab: 'share',
    icon: 'mdi-share-variant',
  },
]

// 插件标签页
export const PluginTabs = [
  {
    title: '我的插件',
    tab: 'installed',
    icon: 'mdi-puzzle',
  },
  {
    title: '插件市场',
    tab: 'market',
    icon: 'mdi-shopping',
  },
]

// 发现标签页
export const DiscoverTabs = [
  {
    name: 'TheMovieDb',
    tab: 'themoviedb',
    icon: 'themoviedb',
  },
  {
    name: '豆瓣',
    tab: 'douban',
    icon: 'douban',
  },
  {
    name: 'Bangumi',
    tab: 'bangumi',
    icon: 'bangumi',
  },
]
