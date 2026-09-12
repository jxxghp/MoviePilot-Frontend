import api from '@/api'
import { getApiBusinessErrorMessage } from '@/api/client'
import { installPluginFromSource } from '@/api/pluginSource'
import { useI18n } from 'vue-i18n'

/** 分身创建表单提交的载荷，含版本策略与创建前需要补装的版本。 */
export interface PluginCloneSubmission {
  /** 恢复已卸载分身时给出它的后缀；新建时留空，由服务端自动分配。 */
  suffix?: string | null
  name: string
  description: string
  icon: string
  pinned_version?: string | null
  install?: { repo_url: string; release_version: string } | null
  restore_previous?: boolean
}

/** 一次分身创建的结果。失败分支必带 message，且已是可直接展示的完整文案。 */
export type PluginCloneOutcome = { success: true; cloneId: string } | { success: false; message: string }

/**
 * 提供插件卡片与「版本与实例」共用的分身创建流程。
 *
 * 两个入口都要走「按需补装目标版本 → 创建分身」这同一串动作，各写一份必然漂移。
 */
export function usePluginCloneCreation() {
  const { t } = useI18n()

  /**
   * 按版本策略创建一个分身。
   *
   * 锚定到尚未安装的版本时先补装：版本目录不在磁盘上，分身建出来也只会启动失败。
   * 安装失败直接中止且不建分身；已装好的版本目录不回滚——它是源插件的共享资产，
   * 删掉会影响本体与其他分身。
   *
   * @param sourcePluginId 源插件 ID
   * @param form 分身创建表单载荷
   */
  async function createClone(sourcePluginId: string, form: PluginCloneSubmission): Promise<PluginCloneOutcome> {
    if (form.install?.repo_url && form.install.release_version) {
      try {
        await installPluginFromSource(sourcePluginId, {
          repo_url: form.install.repo_url,
          release_version: form.install.release_version,
        })
      } catch (installError) {
        console.error(installError)
        return {
          success: false,
          message: t('plugin.cloneVersionInstallFailed', {
            version: form.install.release_version,
            message: getApiBusinessErrorMessage(installError) || t('common.serverConnectionFailed'),
          }),
        }
      }
    }

    let outcome: { instance_id?: string } | undefined
    try {
      outcome = await api.post<{ instance_id: string }>(
        `plugin/clone/${encodeURIComponent(sourcePluginId)}`,
        {
          suffix: form.suffix?.trim() || null,
          name: form.name.trim(),
          description: form.description.trim(),
          icon: form.icon.trim(),
          pinned_version: form.pinned_version ?? null,
          restore_previous: form.restore_previous ?? true,
        },
        { feedback: 'silent' },
      )
    } catch (error) {
      console.error(error)
      const message = getApiBusinessErrorMessage(error)
      return {
        success: false,
        message: message ? t('plugin.cloneFailed', { message }) : t('plugin.cloneFailedGeneral'),
      }
    }

    // 后缀由服务端分配，实例 ID 只能由它回传；算不出也猜不得
    const cloneId = outcome?.instance_id
    if (!cloneId) {
      return { success: false, message: t('plugin.cloneFailedGeneral') }
    }
    return { success: true, cloneId }
  }

  return { createClone }
}
