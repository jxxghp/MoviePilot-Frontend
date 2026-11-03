import ProgressDialog from '../ProgressDialog.vue'
import vuetify from '@/plugins/vuetify'
import { renderWithProviders } from '@tests/support/render'
import { screen } from '@testing-library/vue'
import { afterEach, describe, expect, it } from 'vitest'

const originalTheme = vuetify.theme.global.name.value

afterEach(() => {
  vuetify.theme.global.name.value = originalTheme
})

describe('进度弹窗的表面对比度', () => {
  it.each(['glass', 'plain'])('%s 材质使用表面文字与主色进度条', async theme => {
    vuetify.theme.global.name.value = theme
    await renderWithProviders(ProgressDialog, {
      props: { modelValue: true, text: '正在整理演示电影（1/3）', value: 35 },
    })

    const text = await screen.findByText('正在整理演示电影（1/3）')
    expect(text.closest('.v-card')).toHaveClass('text-on-surface')
    expect(text.closest('.v-card')).not.toHaveClass('bg-primary')
    const progress = screen.getByRole('progressbar')
    expect(progress).toHaveAttribute('aria-valuenow', '35')
    expect(progress.querySelector('.v-progress-linear__determinate')).toHaveClass('bg-primary')
  })
})
