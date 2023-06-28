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
