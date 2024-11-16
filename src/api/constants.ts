export const storageOptions = [
  {
    title: '本地',
    value: 'local',
    icon: 'mdi-folder-multiple-outline',
  },
  {
    title: '阿里云盘',
    value: 'alipan',
    icon: 'mdi-cloud-outline',
  },
  {
    title: '115网盘',
    value: 'u115',
    icon: 'mdi-cloud-outline',
  },
  {
    title: 'RClone',
    value: 'rclone',
    icon: 'mdi-cloud-outline',
  },
  {
    title: 'AList',
    value: 'alist',
    icon: 'mdi-cloud-outline',
  },
]

export const innerFilterRules = [
  { title: '特效字幕', value: ' SPECSUB ' },
  { title: '中文字幕', value: ' CNSUB ' },
  { title: '国语配音', value: ' CNVOI ' },
  { title: '官种', value: ' GZ ' },
  { title: '排除: 国语配音', value: ' !CNVOI ' },
  { title: '粤语配音', value: ' HKVOI ' },
  { title: '排除: 粤语配音', value: ' !HKVOI ' },
  { title: '促销: 免费', value: ' FREE ' },
  { title: '分辨率: 4K', value: ' 4K ' },
  { title: '分辨率: 1080P', value: ' 1080P ' },
  { title: '分辨率: 720P', value: ' 720P ' },
  { title: '排除: 720P', value: ' !720P ' },
  { title: '质量: 蓝光原盘', value: ' BLU ' },
  { title: '排除: 蓝光原盘', value: ' !BLU ' },
  { title: '质量: BLURAY', value: ' BLURAY ' },
  { title: '排除: BLURAY', value: ' !BLURAY ' },
  { title: '质量: UHD', value: ' UHD ' },
  { title: '排除: UHD', value: ' !UHD ' },
  { title: '质量: REMUX', value: ' REMUX ' },
  { title: '排除: REMUX', value: ' !REMUX ' },
  { title: '质量: WEB-DL', value: ' WEBDL ' },
  { title: '排除: WEB-DL', value: ' !WEBDL ' },
  { title: '质量: 60fps', value: ' 60FPS ' },
  { title: '排除: 60fps', value: ' !60FPS ' },
  { title: '编码: H265', value: ' H265 ' },
  { title: '排除: H265', value: ' !H265 ' },
  { title: '编码: H264', value: ' H264 ' },
  { title: '排除: H264', value: ' !H264 ' },
  { title: '效果: 杜比视界', value: ' DOLBY ' },
  { title: '排除: 杜比视界', value: ' !DOLBY ' },
  { title: '效果: 杜比全景声', value: ' ATMOS ' },
  { title: '排除: 杜比全景声', value: ' !ATMOS ' },
  { title: '效果: HDR', value: ' HDR ' },
  { title: '排除: HDR', value: ' !HDR ' },
  { title: '效果: SDR', value: ' SDR ' },
  { title: '排除: SDR', value: ' !SDR ' },
  { title: '效果: 3D', value: ' 3D ' },
  { title: '排除: 3D', value: ' !3D ' },
]

export const storageDict = storageOptions.reduce((dict, item) => {
  dict[item.value] = item.title
  return dict
}, {} as Record<string, string>)
