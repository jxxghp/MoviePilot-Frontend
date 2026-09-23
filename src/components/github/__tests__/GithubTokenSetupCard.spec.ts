import GithubTokenSetupCard from '@/components/github/GithubTokenSetupCard.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

describe('GithubTokenSetupCard', () => {
  it('allows replacing a valid connected token with a manual PAT', async () => {
    await renderWithProviders(GithubTokenSetupCard, {
      props: {
        mode: 'settings',
        status: {
          configured: true,
          valid: true,
          source: 'oauth',
          login: 'moviepilot-user',
          masked_token: 'gho_****',
          expires_at: null,
          needs_reauthorization: false,
        },
        manualToken: '',
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'GitHub Token' }))

    expect(await screen.findByLabelText('GitHub PAT')).toBeVisible()
    expect(screen.getByRole('button', { name: '保存 Token' })).toBeInTheDocument()
  })
})
