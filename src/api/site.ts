import api from './index'

/** 触发一次 CookieCloud 站点同步。 */
export function requestCookieCloudSync(): Promise<null> {
  return api.post<null>('site/cookiecloud', undefined, { feedback: 'silent' })
}

/** 清空全部站点并启动一次新的 CookieCloud 同步。 */
export function resetSiteData(): Promise<null> {
  return api.post<null>('site/reset', undefined, { feedback: 'silent' })
}
