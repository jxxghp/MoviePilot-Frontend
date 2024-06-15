// 导般菜单
export const SystemNavMenus = [
  {
    title: '仪表板',
    icon: 'mdi-home-outline',
    to: '/dashboard',
    header: '开始',
    admin: false,
  },
  {
    title: '推荐',
    icon: 'mdi-star-outline',
    to: '/ranking',
    header: '发现',
    admin: false,
  },
  {
    title: '资源搜索',
    icon: 'mdi-magnify',
    to: '/resource',
    header: '发现',
    admin: false,
  },
  {
    title: '电影',
    full_title: '电影订阅',
    icon: 'mdi-movie-open-outline',
    to: '/subscribe/movie',
    header: '订阅',
    admin: false,
  },
  {
    title: '电视剧',
    full_title: '电视剧订阅',
    icon: 'mdi-television',
    to: '/subscribe/tv',
    header: '订阅',
    admin: false,
  },
  {
    title: '日历',
    full_title: '订阅日历',
    icon: 'mdi-calendar',
    to: '/calendar',
    header: '订阅',
    admin: false,
  },
  {
    title: '正在下载',
    icon: 'mdi-download-outline',
    to: '/downloading',
    header: '整理',
    admin: false,
  },
  {
    title: '历史记录',
    icon: 'mdi-history',
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
    icon: 'mdi-apps',
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
    title: '设定',
    icon: 'mdi-cog',
    to: '/setting',
    header: '系统',
    admin: true,
  },
]

// 常用菜单功能
export const UserfulMenus = [
  {
    title: '搜索设置',
    icon: 'mdi-magnify',
    to: 'setting?tab=search',
  },
  {
    title: '订阅设置',
    icon: 'mdi-rss',
    to: 'setting?tab=subscribe',
  },
  {
    title: '服务',
    icon: 'mdi-list-box',
    to: 'setting?tab=service',
  },
  {
    title: '词表',
    icon: 'mdi-file-word-box',
    to: 'setting?tab=words',
  },
  {
    title: '历史记录',
    icon: 'mdi-history',
    to: 'history',
  },
]

// 设定标签页
export const SettingTabs = [
  {
    title: '用户',
    icon: 'mdi-account',
    tab: 'account',
    description: '个人信息、用户管理、修改密码、双重认证',
  },
  {
    title: '连接',
    icon: 'mdi-server-network',
    tab: 'system',
    description: '下载器（Qbittorrent、Transmission）、媒体服务器（Emby、Jellyfin、Plex）',
  },
  {
    title: '目录',
    icon: 'mdi-folder',
    tab: 'directory',
    description: '下载目录、媒体库目录、整理模式',
  },
  {
    title: '站点',
    icon: 'mdi-web',
    tab: 'site',
    description: '站点同步、下载优先规则、站点重置',
  },
  {
    title: '搜索',
    icon: 'mdi-magnify',
    tab: 'search',
    description: '媒体数据源（TheMovieDb、豆瓣、Bangumi）、搜索站点、搜索优先级、默认过滤规则',
  },
  {
    title: '订阅',
    icon: 'mdi-rss',
    tab: 'subscribe',
    description: '订阅站点、订阅模式、订阅优先级、洗版优先级、默认过滤规则',
  },
  {
    title: '服务',
    icon: 'mdi-list-box',
    tab: 'service',
    description: '定时作业',
  },
  {
    title: '通知',
    icon: 'mdi-bell',
    tab: 'notification',
    description: '通知渠道（微信、Telegram、Slack、SynologyChat、VoceChat）、消息类型',
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
  },
]

// 电影订阅标签页
export const SubscribeMovieTabs = [
  {
    title: '我的订阅',
    tab: 'mysub',
    icon: 'mdi-movie-open-outline',
  },
  {
    title: '热门订阅',
    tab: 'popular',
    icon: 'mdi-movie-open-outline',
  },
]

// 电视剧订阅标签页
export const SubscribeTvTabs = [
  {
    title: '我的订阅',
    tab: 'mysub',
    icon: 'mdi-television',
  },
  {
    title: '热门订阅',
    tab: 'popular',
    icon: 'mdi-television',
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
    icon: 'mdi-store',
  },
]
