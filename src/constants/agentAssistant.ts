// Agent 助手需要覆盖应用内所有普通浮层，因此从 CSS 32 位层级上限向下预留内部顺序。
const MAX_CSS_Z_INDEX = 2_147_483_647

export const AGENT_ASSISTANT_LAYER_Z_INDEX = {
  entry: MAX_CSS_Z_INDEX - 2,
  panel: MAX_CSS_Z_INDEX - 1,
  overlay: MAX_CSS_Z_INDEX,
} as const
