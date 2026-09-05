import api from '@/api'

/** 清空全部旧整理记录；后端会保留持久失败任务，且不会删除任何文件。 */
export async function clearLegacyTransferHistory(): Promise<void> {
  await api.delete<null>('history/transfer/all', { feedback: 'silent' })
}
