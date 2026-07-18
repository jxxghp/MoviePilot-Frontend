import { defineComponent, h, type PropType } from 'vue'

export interface MediaListRequest {
  apipath: string
  params: Record<string, unknown>
}

export function createMediaListHarness() {
  const requests: MediaListRequest[] = []

  const stub = defineComponent({
    name: 'MediaCardListView',
    props: {
      apipath: {
        type: String,
        default: '',
      },
      params: {
        type: Object as PropType<Record<string, unknown>>,
        default: () => ({}),
      },
    },
    setup(props) {
      requests.push({
        apipath: props.apipath,
        params: { ...props.params },
      })

      return () =>
        h(
          'output',
          {
            'aria-label': '媒体列表请求',
            'data-apipath': props.apipath,
          },
          JSON.stringify(props.params, (_key, value) => (value === undefined ? '__undefined__' : value)),
        )
    },
  })

  return { requests, stub }
}

export function latestMediaListRequest(harness: ReturnType<typeof createMediaListHarness>): MediaListRequest {
  const request = harness.requests.at(-1)
  if (!request) throw new Error('MediaCardListView has not mounted')
  return request
}
