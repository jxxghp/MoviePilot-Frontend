/** 面向用户展示的通知文本。 */
export interface NotificationDisplayText {
  title: string
  text: string
}

type NotificationTranslator = (key: string) => string

// 这些词只匹配文件整理执行链的内部一致性校验，避免把普通的权限或路径错误误判为同一类问题。
const TRANSFER_PLAN_CONFLICT_MARKERS = [
  '冻结计划',
  '冻结意图',
  '计划检查点',
  '结算回执',
  '执行检查点',
  '整理终态',
  '全局序号',
  'operation ID',
  '整理步骤',
] as const

const TRANSFER_LEASE_MARKERS = ['租约', '被接管', '接管', 'pending 已不存在', 'lease'] as const

/** 将运行时输入安全地转换成可用于匹配的单行文本。 */
function compactNotificationText(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 判断文本是否包含指定的一组内部错误标记。 */
function containsMarker(text: string, markers: readonly string[]) {
  return markers.some(marker => text.includes(marker))
}

/**
 * 把文件整理执行链的内部一致性错误转换为用户可执行的提示。
 *
 * 原始异常仍保留在后端日志和事件数据中，前端只替换通知展示文本，避免把实现细节直接呈现给用户。
 */
export function formatNotificationForDisplay(
  title: unknown,
  text: unknown,
  translate: NotificationTranslator,
): NotificationDisplayText {
  const rawTitle = String(title ?? '')
  const rawText = String(text ?? '')
  const compactTitle = compactNotificationText(rawTitle)
  const compactText = compactNotificationText(rawText)
  const isFileOrganizeError =
    /文件整理.*(?:错误|失败|异常|出错)|(?:错误|失败|异常|出错).*文件整理/.test(compactTitle) ||
    containsMarker(compactText, TRANSFER_PLAN_CONFLICT_MARKERS) ||
    containsMarker(compactText, TRANSFER_LEASE_MARKERS)

  if (!isFileOrganizeError) return { title: rawTitle, text: rawText }

  if (containsMarker(compactText, TRANSFER_LEASE_MARKERS)) {
    return {
      title: translate('notification.fileOrganizeFailed'),
      text: translate('notification.fileOrganizeLeaseLost'),
    }
  }

  if (containsMarker(compactText, TRANSFER_PLAN_CONFLICT_MARKERS)) {
    return {
      title: translate('notification.fileOrganizeFailed'),
      text: translate('notification.fileOrganizePlanConflict'),
    }
  }

  return {
    title: translate('notification.fileOrganizeFailed'),
    text: translate('notification.fileOrganizeGenericError'),
  }
}
