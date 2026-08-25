import api from './index'

/** Web 管理端可见的受管数据库备份摘要。 */
export interface DatabaseBackupArtifact {
  name: string
  db_type: string
  created_at: string
  size: number
}

/** 受管数据库备份的脱敏校验结果。 */
export interface DatabaseBackupVerification {
  valid: boolean
  method: string
}

/** 查询当前备份目录中的正式制品。 */
export function listDatabaseBackups(): Promise<DatabaseBackupArtifact[]> {
  return api.get('system/database/backups', { feedback: 'silent' })
}

/** 创建、校验并发布当前活动数据库的一致快照。 */
export function createDatabaseBackup(): Promise<DatabaseBackupArtifact> {
  return api.post('system/database/backups', undefined, { feedback: 'silent' })
}

/** 重新校验指定受管备份。 */
export function verifyDatabaseBackup(name: string): Promise<DatabaseBackupVerification> {
  return api.post(`system/database/backups/${encodeURIComponent(name)}/verify`, undefined, {
    feedback: 'silent',
  })
}

/** 删除指定受管备份文件。 */
export function deleteDatabaseBackup(name: string): Promise<void> {
  return api.delete(`system/database/backups/${encodeURIComponent(name)}`, { feedback: 'silent' })
}
