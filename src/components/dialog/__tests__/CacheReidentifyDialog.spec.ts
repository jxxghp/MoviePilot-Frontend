import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import CacheReidentifyDialog from '@/components/dialog/CacheReidentifyDialog.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it, vi } from 'vitest'

// 渲染缓存重识别弹窗并收集提交事件。
async function renderDialog() {
  const confirm = vi.fn()
  const result = await renderWithProviders(CacheReidentifyDialog, {
    global: {
      components: {
        VDialogCloseBtn: DialogCloseBtn,
      },
    },
    props: {
      itemTitle: '周杰伦 - 叶惠美 FLAC',
      modelValue: true,
      musicType: 'album',
      recognizeSource: 'musicbrainz',
      onConfirm: confirm,
    },
  })
  return { ...result, confirm }
}

describe('CacheReidentifyDialog', () => {
  it('submits the music entity namespace with a source-native id', async () => {
    const user = userEvent.setup()
    const { confirm } = await renderDialog()

    expect(screen.getByLabelText('音乐实体')).toBeInTheDocument()
    await user.type(screen.getByLabelText('MusicBrainz ID'), '977e6978-139d-425c-bb98-6b0c62d1e45e')
    await user.click(screen.getByRole('button', { name: '重新识别' }))

    expect(confirm).toHaveBeenCalledWith({
      mediaId: '977e6978-139d-425c-bb98-6b0c62d1e45e',
      mediaSource: 'musicbrainz',
      musicType: 'album',
    })
  })

  it('omits both identity fields when automatic recognition is requested', async () => {
    const user = userEvent.setup()
    const { confirm } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '重新识别' }))

    expect(confirm).toHaveBeenCalledWith({
      mediaId: undefined,
      mediaSource: undefined,
      musicType: 'album',
    })
  })
})
