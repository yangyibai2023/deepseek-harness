/** 创作控制台的 chip 标题。 */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

export interface ConsoleTitleProps extends PropsRuntime<'sidebar.right.pane.tab'> {}

export function ConsoleTitle(_props: ConsoleTitleProps): ReactNode {
  return <span>创作控制台</span>
}
