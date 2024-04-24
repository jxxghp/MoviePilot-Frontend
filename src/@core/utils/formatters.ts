import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import ZH_CN from 'dayjs/locale/zh-cn'

import { isToday } from './index'

dayjs.extend(relativeTime)
dayjs.locale(ZH_CN)

export function avatarText(value: string) {
  if (!value)
    return ''
  const nameArray = value.split(' ')

  return nameArray.map(word => word.charAt(0).toUpperCase()).join('')
}

// TODO: Try to implement this: https://twitter.com/fireship_dev/status/1565424801216311297
export function kFormatter(num: number) {
  const regex = /\B(?=(\d{3})+(?!\d))/g

  return Math.abs(num) > 9999 ? `${Math.sign(num) * +((Math.abs(num) / 1000).toFixed(1))}k` : Math.abs(num).toFixed(0).replace(regex, ',')
}

/**
 * Format and return date in Humanize format
 * Intl docs: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/format
 * Intl Constructor: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat
 * @param {string} value date to format
 * @param {Intl.DateTimeFormatOptions} formatting Intl object to format with
 */
export function formatDate(value: string, formatting: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value)
    return value

  return new Intl.DateTimeFormat('en-US', formatting).format(new Date(value))
}

/**
 * Return short human friendly month representation of date
 * Can also convert date to only time if date is of today (Better UX)
 * @param {string} value date to format
 * @param {boolean} toTimeForCurrentDay Shall convert to time if day is today/current
 */
export function formatDateToMonthShort(value: string, toTimeForCurrentDay = true) {
  const date = new Date(value)
  let formatting: Record<string, string> = { month: 'short', day: 'numeric' }

  if (toTimeForCurrentDay && isToday(date))
    formatting = { hour: 'numeric', minute: 'numeric' }

  return new Intl.DateTimeFormat('en-US', formatting).format(new Date(value))
}

export const prefixWithPlus = (value: number) => value > 0 ? `+${value}` : value

// 格式化为Sxx
export const formatSeason = (value: string) => value ? `S${value.padStart(2, '0')}` : ''

// 格式化为xx[TGMK]B
export function formatFileSize(bytes: number) {
  if (bytes < 0)
    throw new Error('字节数不能为负数。')

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}

// 将时间秒格式化为时分秒
export function formatSeconds(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  let formattedTime = ''

  if (hours > 0)
    formattedTime += `${hours}小时`

  if (minutes > 0)
    formattedTime += `${minutes}分`

  if ((remainingSeconds > 0 || formattedTime === '') && hours <= 0)
    formattedTime += `${remainingSeconds}秒`

  return formattedTime
}

// YYYY-MM-DD 转化为Date
export function parseDate(dateString: string): Date | null {
  if (!dateString)
    return null
  const [year, month, day] = dateString.split('-').map(Number)

  return new Date(year, month - 1, day)
}

// 文件大小格式化
export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0)
    return '0 bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
}

// 格式化剧集列表
export function formatEp(nums: number[]): string {
  if (!nums.length)
    return ''

  if (nums.length === 1)
    return nums[0].toString()

  // 将数组升序排序
  nums.sort((a, b) => a - b)
  const formattedRanges: string[] = []
  let start = nums[0]
  let end = nums[0]

  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === end + 1) {
      end = nums[i]
    }
    else {
      if (start === end)
        formattedRanges.push(start.toString())

      else
        formattedRanges.push(`${start.toString()}-${end.toString()}`)

      start = end = nums[i]
    }
  }

  if (start === end)
    formattedRanges.push(start.toString())

  else
    formattedRanges.push(`${start.toString()}-${end.toString()}`)

  return formattedRanges.join('、')
}

// 将yyyy-mm-dd hh:mm:ss转换为时间差，如：1小时前，1天前
export function formatDateDifference(dateString: string): string {
  // const timeDifference = dayjs().millisecond() - dayjs(dateString).millisecond()
  // const secondsDifference = Math.floor(timeDifference / 1000)
  // const minutesDifference = Math.floor(secondsDifference / 60)
  // const hoursDifference = Math.floor(minutesDifference / 60)
  // const daysDifference = Math.floor(hoursDifference / 24)

  // if (daysDifference > 0)
  //   return `${daysDifference}天前`
  // else if (hoursDifference > 0)
  //   return `${hoursDifference}小时前`
  // else if (minutesDifference > 0)
  //   return `${minutesDifference}分钟前`
  // else
  //   return '刚刚'
  if (!dateString)
    return ''
  return dayjs(dateString).fromNow()
}
