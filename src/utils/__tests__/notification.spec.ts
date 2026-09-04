import { formatNotificationForDisplay } from '@/utils/notification'
import { describe, expect, it } from 'vitest'

const translations: Record<string, string> = {
  'notification.fileOrganizeFailed': '文件整理失败',
  'notification.fileOrganizeGenericError': '文件整理没有完成，请刷新整理历史后重试。',
  'notification.fileOrganizeLeaseLost': '任务已被其他操作接管或已失效，请刷新整理历史后重试。',
  'notification.fileOrganizePlanConflict': '文件整理任务的执行计划与当前记录不一致，请刷新整理历史后重试。',
}

const translate = (key: string) => translations[key] || key

describe('notification display text', () => {
  it('explains frozen-plan conflicts without exposing execution internals', () => {
    expect(
      formatNotificationForDisplay('文件整理发生了错误', '整理步骤意图类型或参数不能由冻结计划导出', translate),
    ).toEqual({
      title: '文件整理失败',
      text: '文件整理任务的执行计划与当前记录不一致，请刷新整理历史后重试。',
    })
  })

  it('gives lease conflicts an actionable recovery step', () => {
    expect(formatNotificationForDisplay('文件整理发生了错误', '整理任务租约已失效或被接管', translate)).toEqual({
      title: '文件整理失败',
      text: '任务已被其他操作接管或已失效，请刷新整理历史后重试。',
    })
  })

  it('does not rewrite unrelated notifications', () => {
    expect(formatNotificationForDisplay('下载失败', '远程服务器返回 404', translate)).toEqual({
      title: '下载失败',
      text: '远程服务器返回 404',
    })
  })
})
