import { HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiFailureJson, apiJson } from '../support/msw/response'

describe('API response fixtures', () => {
  it('keeps raw MSW responses unchanged for HTTP errors and plugin protocols', async () => {
    const response = HttpResponse.json([{ id: 1 }])

    await expect(response.json()).resolves.toEqual([{ id: 1 }])
  })

  it('builds the complete main-program success envelope explicitly', async () => {
    const response = apiJson({ id: 1 })

    await expect(response.json()).resolves.toEqual({ data: { id: 1 }, message: '', success: true })
  })

  it('builds the complete main-program business-failure envelope explicitly', async () => {
    const response = apiFailureJson('rejected', { id: 1 })

    await expect(response.json()).resolves.toEqual({ data: { id: 1 }, message: 'rejected', success: false })
  })
})
