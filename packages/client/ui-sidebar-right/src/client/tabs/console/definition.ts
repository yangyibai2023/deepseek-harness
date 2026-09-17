/**
 * HeightLab 创作控制台（营销模式）：按需出现的页面型 tab。
 * 不注册 guide 入口——指南页不列出、用户无法点击打开；
 * 仅在做同款/聊天意图触发 openTab(kind) 时出现（见 hl:open-console）。
 */
import type { SidebarRightTabDefinition } from '../../tab-registry.ts'

export const CONSOLE_ID = '@heightlab/dsh-client-ui-sidebar-right/console'
export const CONSOLE_KIND = 'heightlab-console'

export function consoleDefinition(): SidebarRightTabDefinition {
  return {
    id: CONSOLE_ID,
    kind: CONSOLE_KIND,
    priority: 'builtin',
    title: () => '创作控制台',
  }
}
