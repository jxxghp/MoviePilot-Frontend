import type { StorageConf, TransferDirectoryConf } from '@/api/types'
import DirectoryCard from '@/components/cards/DirectoryCard.vue'
import { fireEvent, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

const storages: StorageConf[] = [
  {
    name: '本地',
    type: 'local',
    config: {},
  },
]

function createDirectory(overrides: Partial<TransferDirectoryConf> = {}): TransferDirectoryConf {
  return {
    name: '测试目录',
    priority: 0,
    storage: 'local',
    monitor_type: 'monitor',
    transfer_type: 'move',
    ...overrides,
  }
}

async function renderDirectoryCard(directory: TransferDirectoryConf) {
  const result = await renderWithProviders(DirectoryCard, {
    props: {
      categories: {},
      directory,
      storages,
    },
    global: {
      stubs: {
        VDialogCloseBtn: true,
        VPathField: true,
      },
    },
  })
  const expandButton = result.container.querySelector('.v-card-actions button')

  expect(expandButton).not.toBeNull()
  await fireEvent.click(expandButton as HTMLButtonElement)
  await screen.findByLabelText('媒体类型')

  return result
}

describe('DirectoryCard', () => {
  it('allows directory monitoring to disable empty-directory cleanup', async () => {
    const directory = createDirectory({ delete_empty_dirs: true })
    await renderDirectoryCard(directory)
    const cleanupSwitch = screen.getByLabelText('删除空文件夹')

    expect(cleanupSwitch).toBeChecked()
    await userEvent.click(cleanupSwitch)
    expect(directory.delete_empty_dirs).toBe(false)
  })

  it('hides empty-directory cleanup for downloader monitoring', async () => {
    await renderDirectoryCard(createDirectory({ delete_empty_dirs: true, monitor_type: 'downloader' }))

    expect(screen.queryByLabelText('删除空文件夹')).not.toBeInTheDocument()
  })
})
