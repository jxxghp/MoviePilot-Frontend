import api from '@/api'
import type { DownloadDirectory, StorageOption, TransferDirectoryConf } from '@/api/types'

/** 目录查询支持的用途筛选。 */
export type TransferDirectoryType = 'all' | 'download' | 'library'

/** 目录查询支持的存储位置筛选。 */
export type TransferDirectoryStorageType = 'all' | 'local' | 'remote'

/** 结构化目录查询参数。 */
export interface TransferDirectoryQuery {
  directory_type?: TransferDirectoryType
  name?: string
  storage_type?: TransferDirectoryStorageType
}

/** 查询可直接提交给下载接口的保存路径。 */
export async function listDownloadDirectories(): Promise<DownloadDirectory[]> {
  const result = await api.get<DownloadDirectory[]>('download/paths', { feedback: 'silent' })
  return Array.isArray(result) ? result : []
}

/** 查询不包含连接配置和凭据的存储选项。 */
export async function listStorageOptions(): Promise<StorageOption[]> {
  const result = await api.get<StorageOption[]>('storage/options', { feedback: 'silent' })
  return Array.isArray(result) ? result : []
}

/** 按用途和存储位置查询完整目录选择合同。 */
export async function listTransferDirectories(query: TransferDirectoryQuery = {}): Promise<TransferDirectoryConf[]> {
  const result = await api.get<TransferDirectoryConf[]>('storage/directories', {
    feedback: 'silent',
    params: query,
  })
  return Array.isArray(result) ? result : []
}
