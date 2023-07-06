// 订阅
export interface Subscribe {
  id: number;
  // 订阅名称
  name: string;
  // 订阅年份
  year: string;
  // 订阅类型 电影/电视剧
  type: string;
  // 搜索关键字
  keyword?: string;
  tmdbid: number;
  doubanid?: string;
  // 季号
  season?: number;
  // 海报
  poster?: string;
  // 背景图
  backdrop?: string;
  // 评分
  vote?: number;
  // 描述
  description?: string;
  // 过滤规则
  filter?: string;
  // 包含
  include?: string;
  // 排除
  exclude?: string;
  // 总集数
  total_episode?: number;
  // 开始集数
  start_episode?: number;
  // 缺失集数
  lack_episode?: number;
  // 附加信息
  note?: string;
  // 状态：N-新建， R-订阅中
  state: string;
  // 最后更新时间
  last_update: string;
  // 订阅用户
  username: string;
}

// 历史记录
export interface TransferHistory {
  // ID
  id: number;
  // 源目录
  src?: string;
  // 目的目录
  dest?: string;
  // 转移模式link/copy/move/softlink
  mode?: string;
  // 类型：电影、电视剧
  type?: string;
  // 二级分类
  category?: string;
  // 标题
  title?: string;
  // 年份
  year?: string;
  // TMDBID
  tmdbid?: number;
  // IMDBID
  imdbid?: string;
  // TVDBID
  tvdbid?: number;
  // 豆瓣ID
  doubanid?: string;
  // 季Sxx
  seasons?: string;
  // 集Exx
  episodes?: string;
  // 海报
  image?: string;
  // 下载器Hash
  download_hash?: string;
  // 状态 1-成功，0-失败
  status: boolean;
  // 失败原因
  errmsg?: string;
  // 日期
  date?: string;
}


// 媒体信息
export interface MediaInfo {
  // 类型 电影、电视剧
  type?: string
  // 媒体标题
  title?: string
  // 年份
  year?: string
  // 季号
  season?: number;
  // TMDB ID
  tmdb_id?: number
  // IMDB ID
  imdb_id?: string
  // TVDB ID
  tvdb_id?: string
  // 豆瓣ID
  douban_id?: string
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
  vote_average: number
  // 描述
  overview?: string
  // 二级分类
  category?: string
}


// TMDB季信息
export interface TmdbSeason {
  air_date?: string
  episode_count?: number
  name?: string
  overview?: string
  poster_path?: string
  season_number?: number
  vote_average?: number
}

// TMDB集信息
export interface TmdbEpisodes {
  air_date?: string
  episode_number?: number
  name?: string
  overview?: string
  runtime?: number
  season_number?: number
  still_path?: string
  vote_average?: number
  crew: Object[]
  guest_stars: Object[]
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
  // User-Agent
  ua?: string
  // 是否使用代理
  proxy?: number
  // 过滤规则
  filter?: string
  // 是否演染
  render?: number
  // 备注
  note?: string
  // 流控单位周期
  limit_interval?: number
  // 流控次数
  limit_count?: number
  // 流控间隔
  limit_seconds?: number
  // 是否启用
  is_active: boolean
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
}


export interface NotExistMediaInfo {
  // 季
  season: number
  // 剧集列表
  episodes: number[]
  // 总集数
  total_episodes: number
  // 开始集
  start_episode: number
}
