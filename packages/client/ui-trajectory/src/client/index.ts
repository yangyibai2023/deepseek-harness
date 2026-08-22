/**
 * Browser trajectory plugin contributing one entry to the conversation view
 * slot without defining a service.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'conversation.view' SlotMap row (declared by the slot's
// owning package) must be in the program for the register calls to type.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { createTrajectoryDurationStore } from './duration-store.ts'
import { en, NS, zh } from './locales.ts'
import { registerTrajectoryAssistantDefinition } from './trajectory-assistant-definition.ts'
import { registerTrajectoryCompactionDefinitions } from './trajectory-compaction-definition.ts'
import { registerTrajectoryMessageDefinitions } from './trajectory-message-definitions.ts'
import { registerTrajectoryRequestHeaderDefinition } from './trajectory-request-header-definition.ts'
import { registerTrajectoryConversationView } from './trajectory-snapshot-builder.ts'
import { registerTrajectoryToolDefinition } from './trajectory-tool-definition.ts'
import { TrajectoryView, type TrajectoryViewInjected } from './TrajectoryView.tsx'

/** Required services: the conversation slot, registries, ordinary Session paging, and the locale service. */
export const inject = ['slots', 'conversationEvents', 'conversationViews', 'sessions', 'locale']

/**
 * Client plugin body: register the trajectory view tab. The registration
 * rides the slot service's effect wrapper, so plugin unload removes the tab.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-trajectory: dictionaries')
  const duration = createTrajectoryDurationStore()
  registerTrajectoryMessageDefinitions(ctx)
  registerTrajectoryRequestHeaderDefinition(ctx)
  registerTrajectoryAssistantDefinition(ctx)
  registerTrajectoryToolDefinition(ctx)
  registerTrajectoryCompactionDefinitions(ctx)
  registerTrajectoryConversationView(ctx)
  // HeightLab：独立「轨迹」页签已收敛为聊天页左侧的轨迹导航条，因此不再
  // 注册 conversation.view 页签（对话页签也随之只剩一个，顶部切换栏自动隐藏）。
  // 注册代码原样保留，改回 true 即可恢复原版页签。
  const trajectoryViewTabEnabled = false
  if (trajectoryViewTabEnabled) {
    // Registration-time text (the view tab label) reads through the bound
    // translate as a thunk, so it follows the active locale without
    // re-registration.
    const t = ctx.locale.bind(NS)
    ctx.slots.inject('conversation.view', () => ctx.slots.register({
      name: 'conversation.view',
      id: 'trajectory',
      order: 10,
      locale: NS,
      label: () => t('view.trajectory'),
      inject: (sessionId: SessionId): TrajectoryViewInjected => {
        const session = ctx.sessions.binding(sessionId)?.session
        if (session === undefined) {
          throw new Error(`ui-trajectory: session "${sessionId}" is unavailable`)
        }
        return {
          hooks: { duration },
          loadOlder: async () => {
            const before = session.getSnapshot().views.get('trajectory')
            await session.loadOlder()
            return session.getSnapshot().views.get('trajectory') !== before
          },
          setActualDuration: (value) => { duration.set(value) },
        }
      },
    }, TrajectoryView))
  }
}
