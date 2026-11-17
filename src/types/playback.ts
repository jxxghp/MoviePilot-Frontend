/** 已入库单集的真实播放标识与可选展示信息；元数据缺失不影响选择和播放。 */
export interface PlayableEpisode {
  episode: number
  itemId: string
  name?: string
  stillPath?: string
  overview?: string
  airDate?: string
  runtime?: number
}
