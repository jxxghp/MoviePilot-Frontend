import type { TorrentInfo } from '@/api/types'

export interface TorrentProbeResult {
  size?: number
  seeders?: number
  peers?: number
  state?: string
  has_metadata?: boolean
  timed_out?: boolean
  availability?: number
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined

  if (typeof value === 'string' && value.trim()) {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : undefined
  }

  return undefined
}

export function isMagnetLink(value?: string | null): boolean {
  return Boolean(value?.toLowerCase().startsWith('magnet:'))
}

export function needsTorrentProbe(torrent?: Partial<TorrentInfo> | null): boolean {
  if (!isMagnetLink(torrent?.enclosure)) return false

  const hasProbeResult =
    torrent?.probe_has_metadata !== undefined ||
    torrent?.probe_timed_out !== undefined ||
    Boolean(torrent?.probe_state)
  if (hasProbeResult) return false

  const size = toFiniteNumber(torrent?.size)
  const seeders = toFiniteNumber(torrent?.seeders)

  return size === undefined || size <= 1 || seeders === undefined || seeders <= 0
}

export function applyTorrentProbeResult(torrent: TorrentInfo, result: TorrentProbeResult) {
  const size = toFiniteNumber(result.size)
  const seeders = toFiniteNumber(result.seeders)
  const peers = toFiniteNumber(result.peers)
  const availability = toFiniteNumber(result.availability)

  if (size !== undefined && size > 1) {
    torrent.size = size
  }
  if (seeders !== undefined) {
    torrent.seeders = seeders
  }
  if (peers !== undefined) {
    torrent.peers = peers
  }
  if (availability !== undefined) {
    torrent.probe_availability = availability
  }

  torrent.probe_state = result.state
  torrent.probe_has_metadata = result.has_metadata
  torrent.probe_timed_out = result.timed_out
}
