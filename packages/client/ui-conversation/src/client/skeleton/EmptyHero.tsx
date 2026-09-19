// The composer remains in ConversationRoot so switching out of the blank-draft
// phase does not remount its textarea.

import type { ReactNode, RefObject } from 'react'
import {
  IconChevronDownOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { IconFolderCloseStroke16, IconFolderOpenStroke16 } from './folder-icons.tsx'
import { workspaceTitleOf } from '@deepseek-ai/dsh-util-workspace-path'
import type { ConversationSlotProps } from '../contract/slots.ts'
import css from './HeroShell.module.css'

/** The owner's locale seat type, passed to hero chrome as a plain prop. */
type HeroTranslate = ConversationSlotProps['t']

/**
 * Basename label for the workspace chip (the shared derivation);
 * separator-only paths echo the raw cwd.
 * @param cwd - workspace directory path (non-empty).
 * @returns chip label.
 */
export function workspaceLabel(cwd: string): string {
  const base = workspaceTitleOf(cwd)
  return base !== '' ? base : cwd
}

/**
 * The workspace chip (folder + label + chevron), always interactive: before
 * the first message the workspace stays switchable — picking another one
 * moves the New Session flow to that workspace's blank session. Without a
 * label the chip renders its placeholder state: closed folder + the
 * "Choose workspace" call to action.
 * @param props.label - chip label (see {@link workspaceLabel}); omitted → placeholder.
 * @param props.menuOpen - menu expansion echo.
 * @param props.onClick - menu toggle.
 * @returns the chip button element.
 */
export function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t }: {
  buttonRef?: RefObject<HTMLButtonElement>
  label?: string | undefined
  menuOpen?: boolean
  onClick?: () => void
  t: HeroTranslate
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={css.workspace}
      aria-label={t('hero.chooseWorkspace')}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onClick={onClick}
    >
      {label === undefined
        ? <IconFolderCloseStroke16 className={css.folder} size={16} />
        : <IconFolderOpenStroke16 className={css.folder} size={16} />}
      <span className={css.workspaceLabel}>{label ?? t('hero.chooseWorkspace')}</span>
      <IconChevronDownOutline14 className={css.chevron} size={12} />
    </button>
  )
}

// HeightLab V24b：复刻模式空状态引导（替代品牌 hero）。数据与 Dock 共用。
import { useEffect, useState } from 'react'
import { REPLICATION_GROUPS } from './HeightLabTemplateDock.tsx'

/** HeightLab 2026-09-19：主页空状态 headline 打字机（官网式，循环播放）。 */
// 与新官网 hero 完全一致的两句轮播（data-hero-typewriter / -secondary）。
const HERO_TYPING_PHRASES = [
  '从一张产品图，到一支带货视频',
  '文案、图片、视频，电商内容一站生成',
]

function useTypewriter(phrases: readonly string[], typeMs = 95, holdMs = 2600, deleteMs = 42, gapMs = 600): string {
  const [text, setText] = useState('')
  useEffect(() => {
    let phrase = 0
    let chars = 0
    let deleting = false
    let timer = 0
    const step = (): void => {
      const current = phrases[phrase] ?? ''
      if (!deleting) {
        chars += 1
        setText(current.slice(0, chars))
        if (chars >= current.length) {
          deleting = true
          timer = window.setTimeout(step, holdMs)
          return
        }
        timer = window.setTimeout(step, typeMs)
      } else {
        chars -= 1
        setText(current.slice(0, chars))
        if (chars <= 0) {
          deleting = false
          phrase = (phrase + 1) % phrases.length
          timer = window.setTimeout(step, gapMs)
          return
        }
        timer = window.setTimeout(step, deleteMs)
      }
    }
    timer = window.setTimeout(step, 500)
    return () => { window.clearTimeout(timer) }
  }, [phrases, typeMs, holdMs, deleteMs, gapMs])
  return text
}

/** Hero chrome props. The workspace row rides the InputBar accessory hole, not here. */
export interface HeroShellProps {
  /** The owner's locale seat, passed down as a plain prop. */
  t: HeroTranslate
  /** Authorized renderer for the hero brand-mark slot. */
  renderSlot: ConversationSlotProps['renderSlot']
  /** Overlay content after the stack (modals). */
  children?: ReactNode
}



/**
 * Render the hero chrome (headline only; no composer, no workspace row).
 * @param props - see {@link HeroShellProps}.
 * @returns the centered hero element tree.
 */
export function HeroShell({ t, renderSlot, children }: HeroShellProps) {
  const typed = useTypewriter(HERO_TYPING_PHRASES)
  // HeightLab V24b：视频复刻二级页面的空状态 = 引导选项区（无品牌 logo/品牌语）。
  const [replicationMode, setReplicationMode] = useState(
    () => localStorage.getItem('hl-console-mode') === 'replication',
  )
  useEffect(() => {
    const sync = (): void => setReplicationMode(localStorage.getItem('hl-console-mode') === 'replication')
    window.addEventListener('hl:mode-change', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('hl:mode-change', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  if (replicationMode) {
    const chipClick = (kind: string, value: string): void => {
      if (kind === 'console') {
        window.dispatchEvent(new CustomEvent('hl:open-console'))
        return
      }
      if (kind === 'prefill') {
        window.dispatchEvent(new CustomEvent('hl:fill-draft', { detail: { text: value } }))
        return
      }
      const eventName = kind === 'mode' ? 'hl:rep-mode' : kind === 'voice' ? 'hl:rep-voice' : 'hl:rep-subtitle'
      window.dispatchEvent(new CustomEvent(eventName, { detail: { value } }))
    }
    return (
      <div
        className={css.root}
        data-tauri-drag-region="deep"
        /* HeightLab V24b 用户反馈：复刻模式下引导贴顶、输入框必须贴底
           （与正常聊天一致）。原 root 是垂直居中容器——改为顶部对齐，
           并让 stack 之后的弹性空间把 composer 推到底部。 */
        style={{ alignItems: 'flex-start', justifyContent: 'flex-start', paddingTop: 40 }}
      >
        <div className={css.stack}>
          <div style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>视频复刻工作台</div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 14 }}>
              在右侧控制台上传原视频并完成配置后点「生成视频」；下方快捷选项可直接切换参数或预填改款需求。
            </div>
            {REPLICATION_GROUPS.map(group => (
              <div key={group.title} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#888', margin: '0 0 5px' }}>{group.title}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {group.chips.map(chip => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => chipClick(chip.kind, chip.value)}
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #d9d9d9',
                        borderRadius: 16,
                        background: '#fff',
                        color: '#1a1a1a',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 24 }} />
        </div>
        {children}
      </div>
    )
  }
  return (
    /* HeightLab：新对话页顶部/空白区域作为透明拖拽区（无可见条、不占布局），
       让覆盖式标题栏下也能拖拽移动窗口；输入卡片位于其上层，不影响交互。 */
    <div className={css.root} data-tauri-drag-region="deep">
      <div className={css.stack}>
        <div className={css.headline}>
          {/* figma 34:10412: fish 34×25 leading the headline, gap 10. */}
          <span className={css.fishHitbox}>
            {/* HeightLab 2026-08-26：黑色胶囊 PNG（透明底）替代上游鱼形 logo，
                随 build:web 进 public→dist；暗色主题由 CSS invert 转白。 */}
            {renderSlot('conversation.hero.brand.mark', { size: 34, className: css.fish }, {
              fallback: <img src="/heightlab-logo.png" alt="" className={css.fish} draggable={false} />,
            })}
          </span>
          <span className={css.titleGroup}>
            {/* Own element: keeps the headline text addressable apart from the badge.
                HeightLab 2026-09-19：headline 打字机循环（官网式动效）。 */}
            <span>
              {typed}
              <span className={css.typingCaret}>▍</span>
            </span>
            <span className={css.previewBadge}>{t('hero.preview')}</span>
          </span>
        </div>
        <div className={css.body}>
          {/* The composer remains mounted outside this component. */}
        </div>
      </div>
      {children}
    </div>
  )
}
