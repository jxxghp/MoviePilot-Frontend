// 订阅
export interface Subscribe {
  id: number
  // 订阅名称
  name: string
  // 订阅年份
  year: string
  // 订阅类型 电影/电视剧
  type: string
  // 搜索关键字
  keyword?: string
  // TMDB ID
  tmdbid: number
  // 豆瓣ID
  doubanid?: string
  // 季号
  season?: number
  // 海报
  poster?: string
  // 背景图
  backdrop?: string
  // 评分
  vote?: number
  // 描述
  description?: string
  // 过滤规则
  filter?: string
  // 包含
  include?: string
  // 排除
  exclude?: string
  // 质量
  quality?: string
  // 分辨率
  resolution?: string
  // 特效
  effect?: string
  // 总集数
  total_episode?: number
  // 开始集数
  start_episode?: number
  // 缺失集数
  lack_episode?: number
  // 附加信息
  note?: string
  // 状态：N-新建， R-订阅中
  state: string
  // 最后更新时间
  last_update: string
  // 订阅用户
  username: string
  // 订阅站点
  sites: number[]
  // 是否洗版，数字或者boolean
  best_version: any
  // 使用 imdbid 搜索
  search_imdbid?: any
  // 当前优先级
  current_priority: number
  // 保存目录
  save_path?: string
  // 时间
  date: string
  // 编辑框设置项
  show_edit_dialog: boolean
  // 编辑框打开状态
  page_open?: boolean
}

// 历史记录
export interface TransferHistory {
  // ID
  id: number
  // 源目录
  src?: string
  // 目的目录
  dest?: string
  // 转移模式link/copy/move/softlink/rclone_copy/rclone_move
  mode?: string
  // 类型：电影、电视剧
  type?: string
  // 二级分类
  category?: string
  // 标题
  title?: string
  // 年份
  year?: string
  // TMDBID
  tmdbid?: number
  // IMDBID
  imdbid?: string
  // TVDBID
  tvdbid?: number
  // 豆瓣ID
  doubanid?: string
  // 季Sxx
  seasons?: string
  // 集Exx
  episodes?: string
  // 海报
  image?: string
  // 下载器Hash
  download_hash?: string
  // 状态 1-成功，0-失败
  status: boolean
  // 失败原因
  errmsg?: string
  // 日期
  date?: string
}

// 媒体信息
export interface MediaInfo {
  // 来源：themoviedb、douban、bangumi
  source?: string
  // 类型 电影、电视剧
  type?: string
  // 媒体标题
  title?: string
  // 年份
  year?: string
  // 标题（年）
  title_year?: string
  // 季号
  season?: number
  // TMDB ID
  tmdb_id?: number
  // IMDB ID
  imdb_id?: string
  // TVDB ID
  tvdb_id?: string
  // 豆瓣ID
  douban_id?: string
  // Bangumi ID
  bangumi_id?: string
  // 媒体原语种
  original_language?: string
  // 媒体原发行标题
  original_title?: string
  // 媒体发行日期
  release_date?: string
  // 背景图片
  backdrop_path?: string
  // 海报图片
  poster_path?: string
  // 评分
  vote_average?: number
  // 描述
  overview?: string
  // 二级分类
  category?: string
  // 详情页面
  detail_link?: string
  // 季详情
  season_info?: TmdbSeason[]
  // 导演
  directors?: any[]
  // 演员
  actors?: any[]
  // 成人内容
  adult?: boolean
  // 创建人
  created_by?: string[]
  // 集时长
  episode_run_time: string[]
  // 风格
  genres?: string[]
  // 首映日期
  first_air_date?: string
  // 主页
  homepage?: string
  // 语言
  languages?: string[]
  // 最后更新日期
  last_air_date?: string
  // 流媒体
  networks?: string[]
  // 总集数
  number_of_episodes?: number
  // 总季数
  number_of_seasons?: number
  // 原产国
  origin_country: string[]
  // 原名
  original_name?: string
  // 出品公司
  production_companies?: any[]
  // 出品国
  production_countries?: any[]
  // 语种
  spoken_languages?: string[]
  // 状态
  status?: string
  // 标签
  tagline?: string
  // 评分人数
  vote_count?: number
  // 流行度
  popularity?: number
  // 时长
  runtime?: number
  // 下一集
  next_episode_to_air?: object
  // 别名
  names?: string[]
}

// TMDB季信息
export interface TmdbSeason {
  // 上映日期
  air_date?: string
  // 总集数
  episode_count?: number
  // 季名称
  name?: string
  // 描述
  overview?: string
  // 海报
  poster_path?: string
  // 季号
  season_number?: number
  // 评分
  vote_average?: number
}

// TMDB集信息
export interface TmdbEpisode {
  // 上映日期
  air_date?: string
  // 集号
  episode_number?: number
  // 剧集名称
  name?: string
  // 描述
  overview?: string
  // 时长
  runtime?: number
  // 季号
  season_number?: number
  // 海报
  still_path?: string
  // 评分
  vote_average?: number
  // 演职人员
  crew: Object[]
  // 嘉宾
  guest_stars: Object[]
}

// TMDB人物信息
export interface Person {
  // 来源：themoviedb、douban、bangumi
  source?: string
  // ID
  id?: number
  // 名称
  name?: string
  // 角色
  character?: string
  // 性别
  gender?: number | string
  // 生日
  birthday?: string
  // 详情
  biography?: string
  // images large/normal douban、bangumi
  images?: { [key: string]: string }
  // themoviedb
  // themoviedb图片
  profile_path?: string
  // 原名
  original_name?: string
  // 演员ID
  credit_id?: string
  // 别名
  also_known_as?: string[]
  // 卒日
  deathday?: string
  // IMDB ID
  imdb_id?: string
  // 部门
  known_for_department?: string
  // 出生地
  place_of_birth?: string
  // 热度
  popularity?: number
  // douban
  // 角色
  roles?: string[]
  // 简介
  title?: string
  // 详情页面
  url?: string
  // 图片
  avatar?: any
  // 别名
  latin_name?: string
  // bangumi
  // 类型
  type?: number | string
  // 角色
  career?: string[]
  // 关系
  relation?: string
}

// 站点
export interface Site {
  // ID
  id: number
  // 站点名称
  name: string
  // 站点主域名Key
  domain: string
  // 站点地址
  url: string
  // 站点优先级
  pri?: number
  // RSS地址
  rss?: string
  // Cookie
  cookie?: string
  // ApiKey
  apikey?: string
  // Token
  token?: string
  // User-Agent
  ua?: string
  // 是否使用代理
  proxy?: any
  // 过滤规则
  filter?: string
  // 是否演染
  render?: any
  // 是否公开站点
  public?: number
  // 备注
  note?: string
  // 超时时间
  timeout?: number
  // 流控单位周期
  limit_interval?: number
  // 流控次数
  limit_count?: number
  // 流控间隔
  limit_seconds?: number
  // 是否启用
  is_active: boolean
}

// 站点使用统计
export interface SiteStatistic {
  // 站点主域名Key
  domain?: string
  // 成功次数
  success?: number
  // 失败次数
  fail?: number
  // 平均耗时
  seconds?: number
  // 最后一次访问状态 0-成功 1-失败
  lst_state?: number
  // 最后访问时间
  lst_mod_date?: string
  // 耗时记录 JSON
  note?: string
}

// 正在下载
export interface DownloadingInfo {
  // HASH
  hash?: string
  // 种子名称
  title?: string
  // 识别后的名称
  name?: string
  // 年份
  year?: string
  // SXXEXX
  season_episode?: string
  // 大小
  size?: number
  // 下载进 度
  progress?: number
  // 状态
  state?: string
  // 下载速度
  dlspeed?: string
  // 上传速度
  upspeed?: string
  // 媒体信息
  media: { [key: string]: any }
  // 下载用户ID
  userid?: string
  // 下载用户名称
  username?: string
}

// 缺失剧集信息
export interface NotExistMediaInfo {
  // 季
  season: number
  // 剧集列表
  episodes: number[]
  // 总集数
  total_episode: number
  // 开始集
  start_episode: number
}

// 插件
export interface Plugin {
  id?: string
  // 插件名称
  plugin_name?: string
  // 插件描述
  plugin_desc?: string
  // 插件图标
  plugin_icon?: string
  // 插件标签，多个以,分隔
  plugin_label?: string
  // 插件版本
  plugin_version?: string
  // 插件作者
  plugin_author?: string
  // 作者主页
  author_url?: string
  // 插件配置项ID前缀
  plugin_config_prefix?: string
  // 加载顺序
  plugin_order?: number
  // 可使用的用户级别
  auth_level?: number
  // 是否已安装
  installed?: boolean
  // 运行状态
  state?: boolean
  // 是否有详情页面
  has_page?: boolean
  // 是否有新版本
  has_update?: boolean
  // 是否本地插件
  is_local?: boolean
  // 插件仓库地址
  repo_url?: string
  // 变更历史
  history?: { [key: string]: string }
  // 添加时间
  add_time?: number
  // 页面打开状态
  page_open?: boolean
}

// 渲染结构
export interface RenderProps {
  component: string
  text?: string
  html?: string
  content?: any
  slots?: any
  props?: any
  events?: any
}

// 仪表板组件
export interface DashboardItem {
  // ID
  id: string
  // 名称
  name: string
  // 插件的仪表板key
  key: string
  // 全局配置
  attrs: { [key: string]: any }
  // col列数
  cols: { [key: string]: number }
  // 页面元素
  elements: RenderProps[]
}

// 种子信息
export interface TorrentInfo {
  // 站点ID
  site?: number
  // 站点名称
  site_name?: string
  // 站点Cookie
  site_cookie?: string
  // 站点UA
  site_ua?: string
  // 站点是否使用代理
  site_proxy: boolean
  // 站点优先级
  site_order: number
  // 种子名称
  title?: string
  // 种子副标题
  description?: string
  // IMDB ID
  imdbid: string
  // 种子链接
  enclosure?: string
  // 详情页面
  page_url?: string
  // 种子大小
  size: number
  // 做种者
  seeders: number
  // 下载者
  peers: number
  // 完成者
  grabs: number
  // 发布时间
  pubdate?: string
  // 已过时间
  date_elapsed?: string
  // 上传因子
  uploadvolumefactor: number
  // 下载因子
  downloadvolumefactor: number
  // HR
  hit_and_run: boolean
  // 种子标签
  labels: string[]
  // 种子优先级
  pri_order: number
  // 促销描述
  volume_factor: string
  // 免费时间
  freedate: string
  // 剩余免费时间
  freedate_diff: string
  // 种子类型
  category: string
}

// 识别元数据
export interface MetaInfo {
  // 是否处理的文件
  isfile: boolean
  // 原字符串
  org_string?: string
  // 原标题（未经识别词转换）
  title?: string
  // 副标题
  subtitle?: string
  // 类型 电影、电视剧
  type: string
  // 识别的中文名
  cn_name?: string
  // 识别的英文名
  en_name?: string
  // 年份
  year?: string
  // 总季数
  total_season: number
  // 识别的开始季 数字
  begin_season?: number
  // 识别的结束季 数字
  end_season?: number
  // 总集数
  total_episode: number
  // 识别的开始集
  begin_episode?: number
  // 识别的结束集
  end_episode?: number
  // Partx Cd Dvd Disk Disc
  part?: string
  // 识别的资源类型
  resource_type?: string
  // 识别的效果
  resource_effect?: string
  // 识别的分辨率
  resource_pix?: string
  // 识别的制作组/字幕组
  resource_team?: string
  // 视频编码
  video_encode?: string
  // 音频编码
  audio_encode?: string
  // 名称（自动中英文）
  name: string
  // SXX-SXX
  season: string
  // SXX-SXX 有季号才返回
  sea: string
  // begin_season 的数字，电视剧没有季的返回1
  season_seq: string
  // 季的数组
  season_list: number[]
  // Exx-Exx
  episode: string
  // 集的数组
  episode_list: number[]
  // ExxExx
  episodes: string
  // xx-xx
  episode_seqs: string
  // begin_episode 的数字
  episode_seq: string
  // SxxExx
  season_episode: string
  // 资源类型字符串，含分辨率
  resource_term: string
  // 发布组/字幕组字符串
  release_group: string
  // 视频编码
  video_term: string
  // 音频编码
  audio_term: string
  // 资源类型+特效
  edition: string
  // 应用的自定义识别词
  apply_words: string[]
}

// 上下文信息
export interface Context {
  // 元信息
  meta_info: MetaInfo
  // 媒体信息
  media_info: MediaInfo
  // 种子信息
  torrent_info: TorrentInfo
}

// 用户信息
export interface User {
  // 用户ID
  id: number
  // 用户名称
  name: string
  // 用户密码
  password: string
  // 用户邮箱
  email: string
  // 是否激活
  is_active: boolean
  // 是否管理员
  is_superuser: boolean
  // 头像
  avatar: string
  // 是否开启双重验证
  is_otp: boolean
}

// 存储空间
export interface Storage {
  // 总空间
  total_storage: number
  // 已使用空间
  used_storage: number
}

// 媒体统计
export interface MediaStatistic {
  // 电影总数
  movie_count: number
  // 电视剧总数
  tv_count: number
  // 电视剧总集数
  episode_count: number
  // 用户数量
  user_count: number
}

// 后台进程
export interface Process {
  // 进程ID
  pid: number
  // 进程名称
  name: string
  // 进程状态
  status: string
  // 进程启动时间
  create_time: number
  // 进程运行时间
  run_time: number
  // 进程CPU占用率
  cpu: number
  // 进程内存占用
  memory: number
}

// 下载器信息
export interface DownloaderInfo {
  // 下载速度
  download_speed: number
  // 上传速度
  upload_speed: number
  // 下载量
  download_size: number
  // 上传量
  upload_size: number
  // 剩余空间
  free_space: number
}

// 定时服务信息
export interface ScheduleInfo {
  // ID
  id: string
  // 名称
  name: string
  // 提供者
  provider: string
  // 状态
  status: string
  // 下次运行时间
  next_run: string
}

// 消息通知
export interface NotificationSwitch {
  // 消息类型
  mtype: string
  // 开关
  wechat: boolean
  telegram: boolean
  slack: boolean
  synologychat: boolean
  vocechat: boolean
  webpush: boolean
}

// 文件浏览接口
export interface EndPoints {
  // 文件列表
  list: any
  // 创建目录
  mkdir: any
  // 删除文件
  delete: any
  // 下载文件
  download: any
  // 图片预览
  image: any
  // 重命名
  rename: any
}

// 文件浏览项目
export interface FileItem {
  // 类型 dir/file
  type: string
  // 文件名
  name: string
  // 文件名不含扩展名
  basename?: string
  // 文件路径
  path: string
  // 文件扩展名
  extension?: string
  // 文件大小
  size?: number
  // 文件子元素
  children?: FileItem[]
  // 文件创建时间
  modify_time?: number
  // 文件ID
  fileid?: string
  // 上级文件ID
  parent_fileid?: string
  // 缩略图
  thumbnail?: string
  // pickcode
  pickcode?: string
  // drive_id
  drive_id?: string
}

// 媒体服务器播放条目
export interface MediaServerPlayItem {
  // ID
  id?: string | number
  // 标题
  title: string
  // 副标题
  subtitle?: string
  // 类型
  type?: string
  // 海报
  image?: string
  // 链接
  link?: string
  // 播放百分比
  percent?: number
}

// 媒体服务器媒体库
export interface MediaServerLibrary {
  // 服务器名称
  server: string
  // ID
  id?: string | number
  // 名称
  name: string
  // 路径
  path?: string
  // 类型
  type?: string
  // 图片
  image?: string
  // 图片列表
  image_list?: string[]
  // 链接
  link?: string
}

// 消息通知
export interface Message {
  // 消息类型
  mtype?: string
  // 消息标题
  title?: string
  // 消息内容
  text?: string
  // 消息链接
  link?: string
  // 消息图片
  image?: string
  // 消息时间
  date?: string
  // 登记时间
  reg_time?: string
  // 用户ID
  userid?: string
  // 消息方向：0-接收，1-发送
  action?: number
  // JSON
  note?: string
}

// 系统通知
export interface SystemNotification {
  // 通知类型 user/system/plugin
  type: string
  // 通知标题
  title: string
  // 通知内容
  text: string
  // 通知时间
  date: string
}

// 下载目录/媒体库目录
export interface MediaDirectory {
  // 类型 download/library
  type?: string
  // 别名
  name?: string
  // 路径
  path?: string
  // 媒体类型 电影/电视剧
  media_type?: string
  // 媒体类别 动画电影/国产剧
  category?: string
  // 刮削媒体信息
  scrape?: boolean
  // 自动二级分类，未指定类别时自动分类
  auto_category?: boolean
  // 优先级
  priority?: number
}
