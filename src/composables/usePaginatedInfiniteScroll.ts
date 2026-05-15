import type { Ref } from 'vue'
import { nextTick } from 'vue'

export type InfiniteScrollStatus = 'ok' | 'empty' | 'loading' | 'error'
export type InfiniteScrollDone = (status: InfiniteScrollStatus) => void

interface InfiniteScrollPage<T> {
  isLastPage?: boolean
  items: T[]
}

interface LoadPaginatedInfiniteScrollOptions<T> {
  advancePage: () => void
  appendItems: (items: T[]) => void
  done: InfiniteScrollDone
  hasScroll?: () => boolean
  loadPage: () => Promise<T[] | InfiniteScrollPage<T>>
  loading: Ref<boolean>
  markLoaded?: () => void
  maxAutoLoadPages?: number
}

const DEFAULT_MAX_AUTO_LOAD_PAGES = 6

export function hasDocumentScroll() {
  return document.body.scrollHeight - (window.innerHeight || document.documentElement.clientHeight) > 2
}

function normalizePageResult<T>(result: T[] | InfiniteScrollPage<T>): InfiniteScrollPage<T> {
  if (Array.isArray(result)) {
    return {
      isLastPage: result.length === 0,
      items: result,
    }
  }

  return result
}

export async function loadPaginatedInfiniteScroll<T>({
  advancePage,
  appendItems,
  done,
  hasScroll = hasDocumentScroll,
  loadPage,
  loading,
  markLoaded,
  maxAutoLoadPages = DEFAULT_MAX_AUTO_LOAD_PAGES,
}: LoadPaginatedInfiniteScrollOptions<T>) {
  if (loading.value) {
    done('ok')
    return
  }

  loading.value = true

  let status: InfiniteScrollStatus = 'ok'
  let loadedPages = 0

  try {
    do {
      const { isLastPage, items } = normalizePageResult(await loadPage())

      markLoaded?.()

      if (isLastPage) {
        status = 'empty'
        break
      }

      if (items.length > 0) {
        appendItems(items)
      }

      advancePage()
      loadedPages += 1

      await nextTick()
    } while (!hasScroll() && loadedPages < maxAutoLoadPages)
  } catch (error) {
    console.error(error)
    status = 'error'
  } finally {
    loading.value = false
    done(status)
  }
}
