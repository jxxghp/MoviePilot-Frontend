# App Center 移动端设计 QA

- Source visual truth: `/Users/jxxghp/.codex/generated_images/019f227f-02c8-74c0-bea9-a59b60a9fa57/exec-9ce518f2-5bba-4249-8187-781c8d2c626e.png`
- Implementation screenshot: `/Users/jxxghp/MPProjects/MoviePilot-Frontend/.codex-qa/appcenter-mobile-light.png`
- Transparent-theme screenshot: `/Users/jxxghp/MPProjects/MoviePilot-Frontend/.codex-qa/appcenter-mobile-transparent.png`
- Full-view comparison: `/Users/jxxghp/MPProjects/MoviePilot-Frontend/.codex-qa/appcenter-mobile-comparison.png`
- Viewport: 390px wide mobile viewport; full-page capture
- State: authenticated App Center, light/default skin and transparent/default skin

**Full-view comparison evidence**

- The implementation preserves the selected concept's grouped iOS menu hierarchy: external section labels, one surface per group, colored rounded-square icons, inset separators, and trailing chevrons.
- Existing MoviePilot shell chrome and permission-filtered menu content intentionally remain unchanged; the reference mock only defines the App Center content surface.
- Focused-region comparison was not needed because the full-height side-by-side comparison keeps row typography, icon tiles, dividers, radii, and section spacing readable.

**Required fidelity surfaces**

- Fonts and typography: existing product font stack retained; mobile titles render at 16px/22px and section labels at 13px/20px without wrapping or truncation.
- Spacing and layout rhythm: 58px tap rows, 12px page gutters, 18px group gaps, inset dividers, and theme-controlled surface radii match the selected direction without horizontal overflow.
- Colors and visual tokens: icon colors come from `NavMenu.iconColor` and global Vuetify semantic color tokens; grouped surfaces, borders, separators, hover/active states, and transparent blur use global tokens.
- Image quality and asset fidelity: the reference contains no raster content; existing Material Design Icons are used rather than generated or handcrafted substitutes.
- Copy and content: existing localized labels and permission filtering are preserved.
- Accessibility and interaction: full-row route links remain functional, touch targets are at least 58px high, active feedback remains visible, and decorative separators are hidden from accessibility APIs.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- [P3] The existing Agent Assistant bubble can overlap the far-right page edge in captures; this is shared shell behavior outside the App Center redesign scope.

**Patches made since the previous QA pass**

- Replaced the row pseudo-element divider, which conflicted with Vuetify's internal pseudo-element, with an explicit 1px separator element.
- Removed the transparent theme's hard-coded group border so the card follows the global bordered/default skin token.
- Moved icon color metadata into shared menu definitions and kept dynamic plugin menus on the primary fallback.
- Constrained the page, cards, lists, rows, and row content to prevent horizontal scrolling.
- Added transparent-theme blur-mode token overrides for lightweight, realtime, and blur-disabled modes.

**Follow-up polish**

- The existing Agent Assistant edge placement can be refined separately if it becomes distracting across other mobile pages.

final result: passed
