import bronze from '@/assets/images/community/bronze.png'
import silver from '@/assets/images/community/silver.png'
import gold from '@/assets/images/community/gold.png'
import core from '@/assets/images/community/core.png'
import type { CommunityArea, CommunityTier } from '@/composables/useCommunityContribution'

/** 勋章资产集中声明，后续只需替换对应文件即可更换正式设计。 */
export const COMMUNITY_BADGE_IMAGES: Record<CommunityTier, string> = { bronze, silver, gold, core }
/** 领域使用主题语义色和图标区分，金属材质只表达贡献等级。 */
export const COMMUNITY_BADGE_AREAS: Record<CommunityArea | 'ecosystem', { icon: string; color: string }> = {
  backend: { icon: 'mdi-code-braces', color: 'info' },
  frontend: { icon: 'mdi-palette-outline', color: 'primary' },
  plugins: { icon: 'mdi-puzzle-outline', color: 'success' },
  performance: { icon: 'mdi-lightning-bolt-outline', color: 'warning' },
  resources: { icon: 'mdi-database-outline', color: 'info' },
  services: { icon: 'mdi-server-outline', color: 'secondary' },
  website: { icon: 'mdi-web', color: 'primary' },
  docs: { icon: 'mdi-book-open-page-variant-outline', color: 'info' },
  ecosystem: { icon: 'mdi-source-branch', color: 'primary' },
}
