// Resident conversation skeleton (HeightLab V32). The root owns the phase,
// the resident header, the drag region, and the hub overlay; hero chrome, the
// V32 scroll flow, and the composer bar live in the content factory
// (ConversationContent). Header/composer/bar stay mounted across
// no-session/session transitions — the bar renders inert via owner props.

import { useEffect, useRef, useState } from 'react'
import type { ConversationSlotProps } from '../contract/slots.ts'
import { conversationPhase } from '../contract/snapshot.ts'
import { ConversationWidthControls } from './ConversationWidthControls.tsx'
// HeightLab：创意灵感/资料库/技能中心覆盖层页（替换聊天页，侧边栏保留）。
import { HeightLabHubPage, type HubPage } from './HeightLabHubPage.tsx'
import { HeightLabSkillHub } from './HeightLabSkillHub.tsx'
import css from './ConversationRoot.module.css'

const CONTENT_SLOTS = { widthControls: ConversationWidthControls }

/* ── ds-bot surface 探测（2026-10-19 用户实测缺陷）──────────────────────────
 * 团队（OPC）模式下点左边任意 BOT，右侧会渲染成**个人模式的首页**：品牌标题、
 * 模板网格、个人输入框——因为 BOT 的会话同样走 ConversationRoot，而 hero 的
 * 判定只看「这个会话是否为空」，不看当前在哪个 surface。
 *
 * `.bt-head` / `.bt-q` / `.bt-composer` 是 ds-bot 自己的聊天区类名（团队欢迎页
 * 也用它判断「是否选中联系人」），出现在 DOM 里就说明当前渲染的是 BOT 聊天。
 * 用 MutationObserver 而不是读一次：surface 切换不一定整页 reload。
 * ───────────────────────────────────────────────────────────────────────── */
function useBotChatSurface(): boolean {
  const [bot, setBot] = useState<boolean>(() =>
    typeof document !== 'undefined' && document.querySelector('.bt-head, .bt-q, .bt-composer') !== null)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const read = (): void => {
      setBot(document.querySelector('.bt-head, .bt-q, .bt-composer') !== null)
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return bot
}

/** Full props composed from the slot contract. */
export type ConversationRootProps = ConversationSlotProps

/**
 * Render the resident Conversation frame.
 * @param props - the original `main.conversation` Slot props.
 * @returns the root, Header, V32 content factory, and hub overlay subtree.
 */
export function ConversationRoot(props: ConversationRootProps) {
  const { sessionId, useSession, useSessions, useConversation, renderSlot, renderFactorySlot } = props
  const session = useSession(s => s)
  const conversation = useConversation(s => s)
  const shellPhase = session === undefined || conversation === undefined
    ? 'blank'
    : conversationPhase(session, conversation)
  const openState = session?.openState
  const summaryBlank = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.blank)

  // While a session is still replaying (loading + blank) the hero/docked
  // choice is unknowable — render the composer hidden instead of flashing
  // the centered hero and snapping to the docked bar (or vice versa).
  // Exemption: a session the list summary already proves blank can only
  // land on the hero, so hiding would blank the column for the whole
  // history round-trip (the startup auto-selection flash) for nothing.
  // The exemption is deliberately open-state-wide, not loading-only: a
  // summary-blank session is the hero before its open starts (`cold`) and
  // after one fails (`error`) for the same reason — there is no history.
  // A restored continuable subagent waits for a Host summary to establish
  // parent availability.
  const parentAvailabilityPending = session?.subagent?.address.mode === 'continuable'
    && session.subagent.parentAvailable === undefined
  const settling = sessionId !== undefined && (
    (shellPhase === 'blank' && openState === 'loading' && summaryBlank !== true)
    || parentAvailabilityPending
  )
  /* 2026-10-19：BOT 聊天里**不显示**个人模式首页（品牌 hero + 模板网格 +
   * 个人输入卡布局）。BOT 的空会话应当就是一个普通的空聊天：消息区为空、
   * 输入框停靠底部，而不是把整个个人首页搬进团队模式。 */
  const botChatSurface = useBotChatSurface()
  const hero = !botChatSurface && (sessionId === undefined
    || (shellPhase === 'blank' && (openState === 'open' || summaryBlank === true)))
  const phase = settling ? 'settling' : hero ? 'hero' : 'active'

  // HeightLab：创意灵感 / 资料库覆盖层页状态（null = 显示聊天）。
  const [hub, setHub] = useState<HubPage | null>(null)
  const hubRef = useRef(hub)
  hubRef.current = hub

  useEffect(() => {
    const onOpen = (event: Event): void => {
      const detail = (event as CustomEvent<{ page?: unknown }>).detail
      // ⚠️ 这里是 hub 页的**白名单**：新增 HubPage 必须同步加进来，否则
      // 事件被静默忽略（点侧栏没反应，且 __hlPendingHub 会一直挂着）。
      // 2026-10-20 新增 'film-studio' 时踩过。
      if (detail?.page === 'inspiration' || detail?.page === 'library' || detail?.page === 'video-studio'
        || detail?.page === 'skill-hub' || detail?.page === 'film-studio') {
        // film-studio 仍走 hub 覆盖层（入口 a：主区满幅 + 右侧开新对话）。
        if (detail.page !== 'library') {
          window.dispatchEvent(new CustomEvent('hl:close-knowledge'))
        }
        // 事件已直达 → 清掉可能残留的 pending（同 onClose 的理由）
        ;(window as unknown as { __hlPendingHub?: HubPage | null }).__hlPendingHub = null
        try { document.body.dataset.hlHub = '1' } catch { /* 非致命 */ }
        setHub(detail.page)
      }
    }
    // HeightLab 2026-10-16：原生面板激活时，SidebarRoot 先 selectPanel(null)
    // 再派发 hl:open-hub——本组件此刻尚未挂载，事件会丢。SidebarRoot 同时把
    // 目标页写入 __hlPendingHub，挂载后立即消费，保证落到 hub 页而非主页。
    const pending = (window as unknown as { __hlPendingHub?: HubPage | null }).__hlPendingHub
    if (pending) {
      ;(window as unknown as { __hlPendingHub?: HubPage | null }).__hlPendingHub = null
      try { document.body.dataset.hlHub = '1' } catch { /* 非致命 */ }
      setHub(pending)
    }
    const onClose = (): void => {
      window.dispatchEvent(new CustomEvent('hl:close-knowledge'))
      try { document.body.dataset.hlHub = '0' } catch { /* 非致命 */ }
      // ⚠️ 必须同时清掉待消费标记：SidebarRoot 点击时会写 __hlPendingHub，
      // 如果本组件**当时已挂载**（事件直接生效、没走 pending 分支），这个标记
      // 就永远挂着；下一次挂载（切模式/新建对话触发的重挂）会再消费一次，
      // 表现为「关掉剪辑台后又被弹回去，要点两次」（2026-10-20 用户实测）。
      ;(window as unknown as { __hlPendingHub?: HubPage | null }).__hlPendingHub = null
      setHub(null)
    }
    window.addEventListener('hl:open-hub', onOpen)
    window.addEventListener('hl:close-hub', onClose)
    return () => {
      window.removeEventListener('hl:open-hub', onOpen)
      window.removeEventListener('hl:close-hub', onClose)
    }
  }, [])

  // HeightLab：创意灵感/自动化采用覆盖层方案，会话视图常驻不卸载；
  // 点「自动化」时若创意灵感开着，只负责关掉它，视图切换由常驻的
  // ConversationSession 同步完成，无补发事件、无竞态。
  useEffect(() => {
    const onOpenAutomation = (): void => {
      window.dispatchEvent(new CustomEvent('hl:close-knowledge'))
      if (hubRef.current !== null) setHub(null)
    }
    window.addEventListener('hl:open-automation', onOpenAutomation)
    return () => { window.removeEventListener('hl:open-automation', onOpenAutomation) }
  }, [])

  // HeightLab：创意灵感/自动化页与右侧边栏互斥——进入时收起右侧/底部面板，
  // 并给 body 打标记让右上角两个折叠按钮隐藏；退出时恢复。
  useEffect(() => {
    try {
      // 自动化视图由 ConversationSession 管理同一个标记；hub 关闭时不要
      // 覆盖「自动化已激活」的状态，避免右侧边栏错误恢复。
      if (hub !== null || document.body.dataset.hlAutomation !== '1') {
        document.body.dataset.hlHub = hub !== null ? '1' : '0'
      }
    } catch { /* 非致命 */ }
    if (hub === null) return
    const labels = ['收起侧边栏', '折叠侧边栏', '收起底部面板', '折叠底部面板']
    const closePanels = (): void => {
      // 只作用于 better-sidebar 的面板宿主，绝不点击左侧原生侧边栏的收起按钮。
      // HeightLab 2026-09-14：0.19.1 删除了 toggleCluster 类（旧版用它圈定按钮簇），
      // 直接以面板宿主 data-dsh-panel-host 为范围——两版都成立的稳定锚点。
      const host = document.querySelector('[data-dsh-panel-host]')
      if (host === null) return
      const buttons = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label]')]
      for (const label of labels) {
        const button = buttons.find(candidate => (candidate.getAttribute('aria-label') ?? '').includes(label))
        if (button) button.click()
      }
    }
    closePanels()
    // 面板可能在会话区被替换后异步自动拉起，延迟重试两次确保收起。
    const timers = [
      window.setTimeout(closePanels, 300),
      window.setTimeout(closePanels, 1000),
    ]
    return () => { for (const timer of timers) window.clearTimeout(timer) }
  }, [hub])

  return (
    <div className={css.root} data-phase={phase}>
      {/* HeightLab：新对话页顶部透明拖拽区（不占布局、不显示任何条），
          覆盖式标题栏下也能拖拽移动窗口；仅 hero 存在。 */}
      {hero && <div className={css.heroDragRegion} data-tauri-drag-region="" aria-hidden="true" />}
      {renderSlot('conversation.header', {})}
      {renderFactorySlot('conversation.content', {
        variant: 'main',
        phase,
        hero,
      }, {
        slots: CONTENT_SLOTS,
      })}
      {/* HeightLab：创意灵感 = 覆盖层页面（会话视图常驻，标签随时互切；
          × 关闭时同时回到对话，避免下层残留自动化视图）。 */}
      {hub !== null && (
        <div className={css.hubOverlay}>
          {hub === 'skill-hub' ? (
            <HeightLabSkillHub onClose={() => { setHub(null); window.dispatchEvent(new CustomEvent('hl:close-knowledge')) }} />
          ) : (
            <HeightLabHubPage
              page={hub}
              onClose={() => {
                setHub(null)
                window.dispatchEvent(new CustomEvent('hl:close-automation'))
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
