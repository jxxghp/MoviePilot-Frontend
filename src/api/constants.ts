export const storageOptions = [
  {
    title: '本地',
    value: 'local',
  },
  {
    title: '阿里云盘',
    value: 'alipan',
  },
  {
    title: '115网盘',
    value: 'u115',
  },
  {
    title: 'Rclone网盘',
    value: 'rclone',
  },
]

export const storageDict = storageOptions.reduce((dict, item) => {
  dict[item.value] = item.title
  return dict
}, {} as Record<string, string>)
