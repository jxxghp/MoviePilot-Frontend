import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import TorrentSingleFilterDialog from '../TorrentSingleFilterDialog.vue'
import { NativeSheetAdapter } from '@/native/sheet'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'

describe('单项资源过滤的原生半屏关闭契约', () => {
  it('保留多选、全选与确认，同时为原生标题栏提供中等高度和独立关闭入口', async () => {
    const result = await renderWithProviders(TorrentSingleFilterDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        filterForm: { resolution: [] },
        filterKey: 'resolution',
        filterTitle: '分辨率',
        filterOptions: { resolution: ['1080p', '2160p'] },
      },
    })
    expect(await screen.findByText('2160p')).toBeVisible()
    const adapter = new NativeSheetAdapter(document)
    const sheet = adapter.read('搜索结果')!
    expect(sheet).toMatchObject({ title: '分辨率', canDismiss: true, prefersMediumDetent: true })
    expect(sheet.actions.map(item => item.title)).toEqual(['全选'])
    expect(adapter.execute('presentation.action', { id: sheet.id, actionId: sheet.actions[0].id })).toBe(true)
    expect(result.emitted().selectAll).toEqual([['resolution']])
    expect(adapter.execute('presentation.dismiss', { id: sheet.id })).toBe(true)
    expect(result.emitted()['update:modelValue']).toEqual([[false]])
    expect(result.emitted().close).toEqual([[]])
  })
})
