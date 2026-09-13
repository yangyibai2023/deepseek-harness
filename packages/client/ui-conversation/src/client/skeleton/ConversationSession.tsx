/** Strict per-session header/body content inserted into the resident conversation layout. */

import { useEffect } from 'react'
import clsx from 'clsx'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ConversationSessionHeaderSlotProps, ConversationSessionSlotProps,
} from '../contract/slots.ts'
import { conversationPhase } from '../contract/snapshot.ts'
import { resolveActiveView } from '../view-selection.ts'
import css from './ConversationRoot.module.css'

/** Full props composed from the strict session body contract. */
export type ConversationSessionProps = ConversationSessionSlotProps

/** Full props composed from the strict session header contract. */
export type ConversationSessionHeaderProps = ConversationSessionHeaderSlotProps

interface Breadcrumb {
  readonly id: SessionId
  readonly displayTitle: string
  readonly subagent: boolean
}

function deriveAncestry(list: SessionListState, id: SessionId): readonly Breadcrumb[] {
  const chain: Breadcrumb[] = []
  const seen = new Set<SessionId>()
  let cursor: SessionId | undefined = id
  while (cursor !== undefined) {
    if (seen.has(cursor)) break
    seen.add(cursor)
    const summary: SessionSummary | undefined = list.byId[cursor]
    if (summary === undefined) break
    chain.unshift({
      id: summary.id,
      displayTitle: summary.displayTitle,
      subagent: summary.origin === 'subagent',
    })
    if (summary.origin !== 'subagent') break
    cursor = summary.parentId
  }
  return chain
}

function equalBreadcrumbs(left: readonly Breadcrumb[], right: readonly Breadcrumb[]): boolean {
  return left.length === right.length
    && left.every((item, index) => {
      const other = right.at(index)
      return other !== undefined && item.id === other.id && item.displayTitle === other.displayTitle
    })
}

/**
 * Renders Session header chrome above the resident conversation scrollport.
 * @param props - Strict Session store, view ledger, navigation, render, and locale shares.
 * @returns the hidden blank-session header or visible title and tabs.
 */
export function ConversationSessionHeader({
  sessionId, useSession, useSessions, useConversation, useConversationViews, useStore,
  renderSlot, open, selectView, t,
}: ConversationSessionHeaderProps) {
  const tabs = useConversationViews(value => value)
  const selectedId = useStore(s => s.view)
  const active = resolveActiveView(tabs, selectedId)
  const ancestry = useSessions(s => deriveAncestry(s, sessionId), equalBreadcrumbs)
  const session = useSession(s => s)
  const conversation = useConversation(s => s)
  const hideChrome = session.blank && conversationPhase(session, conversation) === 'blank'

  return (
    <header
      className={clsx(css.header, hideChrome && css.headerHidden)}
      data-tauri-drag-region="deep"
      data-hl-session-header=""
      aria-hidden={hideChrome || undefined}
    >
      {!hideChrome && (
        <>
          <div className={css.titleRow}>
            <div className={css.titleCluster}>
              <nav className={css.crumbs} aria-label={t('session.hierarchy')}>
                {ancestry.map((summary, index) => {
                  const last = index === ancestry.length - 1
                  const title = (
                    <button
                      type="button"
                      className={clsx(
                        css.crumb,
                        summary.subagent && css.crumbSubagent,
                        last && css.crumbCurrent,
                      )}
                      disabled={last}
                      onClick={() => { open(summary.id) }}
                    >
                      {summary.displayTitle}
                    </button>
                  )
                  const lineage = last || summary.subagent
                  const lineageOwner = {
                    lineageSessionId: summary.id,
                    displayTitle: summary.displayTitle,
                    ...last ? {} : { openTitle: () => { open(summary.id) } },
                  }
                  return (
                    <span key={summary.id} className={css.crumbSeg}>
                      {index > 0 && <span className={css.crumbSep}>/</span>}
                      {lineage
                        ? summary.subagent
                          ? renderSlot(
                            'conversation.session.header.lineage',
                            lineageOwner,
                            { fallback: title },
                          )
                          : (
                            <>
                              {title}
                              {renderSlot(
                                'conversation.session.header.lineage',
                                lineageOwner,
                                { fallback: null },
                              )}
                            </>
                          )
                        : title}
                    </span>
                  )
                })}
                {ancestry.length === 0 && <span className={css.crumbCurrent}>{sessionId}</span>}
              </nav>
              <div className={css.headerActions}>
                {renderSlot('conversation.session.header.actions', {})}
              </div>
            </div>
            <div className={css.headerUtilities}>
              {renderSlot('conversation.session.header.utilities', {})}
            </div>
            <div className={css.headerCorner} data-conversation-header-corner="">
              {renderSlot('conversation.session.header.corner', {})}
            </div>
          </div>
          {tabs.length > 1 && (
            <div className={css.tabs} role="tablist">
              {tabs.map(viewTab => (
                <button
                  key={viewTab.id}
                  type="button"
                  role="tab"
                  aria-selected={viewTab.id === active?.id}
                  className={clsx(css.tab, viewTab.id === active?.id && css.tabActive)}
                  onClick={() => { selectView(viewTab.id) }}
                >
                  {viewTab.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </header>
  )
}

/**
 * Renders the active Session view inside the resident scrollport and keeps
 * the input draft mirrored while blank Hero chrome is visible.
 * @param props - Strict Session input/store, view ledger, and render shares.
 * @returns the active view area, or null while the Session remains blank.
 */
export function ConversationSession({
  useSession, useConversation, useConversationViews, useInput, inputActions, useStore, actions,
  renderSlot, bindDraftMirror, openView,
}: ConversationSessionProps) {
  const tabs = useConversationViews(value => value)
  const selectedId = useStore(s => s.view)
  const active = resolveActiveView(tabs, selectedId)
  const session = useSession(s => s)
  const conversation = useConversation(s => s)
  const inputState = useInput(s => s)
  const storedDraft = useStore(s => s.draft)
  const viewRequest = useStore(s => s.viewRequest ?? null)

  useEffect(() => {
    // HeightLab：清理历史遗留的孤立 U+FFFC 占位符（早期模板胶囊实现产物），
    // 避免输入框出现乱码/乱符号。
    if (inputState.draft === '' && storedDraft !== '') {
      inputActions.setDraft(storedDraft.replace(/\uFFFC/g, ''))
    }
    const unmirror = bindDraftMirror(actions.setDraft)
    return () => { unmirror() }
    // Mount-only (deps pinned to inputActions): later store writes come from
    // the machine mirror, not this seed effect.
  }, [inputActions])

  // HeightLab：自动化视图（dsh-automation 插件）由侧边栏「自动化」进入/退出，
  // 页签条已隐藏，这里负责视图切换。
  useEffect(() => {
    const onOpen = (): void => { actions.setView('automation') }
    const onClose = (): void => { actions.setView('chat') }
    window.addEventListener('hl:open-automation', onOpen)
    window.addEventListener('hl:close-automation', onClose)
    return () => {
      window.removeEventListener('hl:open-automation', onOpen)
      window.removeEventListener('hl:close-automation', onClose)
    }
  }, [actions])

  // HeightLab：自动化视图与右侧边栏互斥（复用 hub 互斥标记与折叠按钮簇），
  // 进入时隐藏右侧按钮与面板，退出/切换会话时恢复。
  useEffect(() => {
    const isAutomation = active?.id === 'automation'
    try {
      document.body.dataset.hlAutomation = isAutomation ? '1' : '0'
      document.body.dataset.hlHub = isAutomation ? '1' : '0'
    } catch { /* 非致命 */ }
    if (!isAutomation) return
    const labels = ['收起侧边栏', '折叠侧边栏', '收起底部面板', '折叠底部面板']
    const closePanels = (): void => {
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
    const timers = [
      window.setTimeout(closePanels, 300),
      window.setTimeout(closePanels, 1000),
    ]
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
      try {
        if (document.body.dataset.hlAutomation === '1') {
          document.body.dataset.hlAutomation = '0'
          document.body.dataset.hlHub = '0'
        }
      } catch { /* 非致命 */ }
    }
  }, [active?.id])

  // HeightLab：自动化视图（dsh-automation）在空白新会话（hero）下也必须
  // 渲染——否则点侧边栏「自动化」没有页面变化（视图被 blank 分支吞掉）。
  if (session.blank && conversationPhase(session, conversation) === 'blank' && active?.id !== 'automation') return null
  return (
    <div className={css.viewArea}>
      {/* HeightLab：自动化页右上角关闭按钮（与创意灵感同款位置/样式）。 */}
      {active?.id === 'automation' && (
        <button
          type="button"
          className={css.automationClose}
          aria-label="关闭自动化"
          title="关闭自动化"
          onClick={() => { actions.setView('chat') }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {active !== undefined && renderSlot('conversation.view', {
        viewRequest,
        openView,
        completeViewRequest: actions.completeViewRequest,
      }, { only: active.id })}
    </div>
  )
}
