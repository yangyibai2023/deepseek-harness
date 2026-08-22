/**
 * The agent-preset chip on the new-session screen, beside the workspace
 * picker.
 *
 * It lives here rather than in the composer because the choice is only
 * available before a conversation starts: once a turn has run, the session's
 * history was produced under that preset's tools and the host refuses to swap
 * them. A control that spends most of its life disabled belongs on the screen
 * where it still works.
 *
 * The menu opens on the staged choice, which starts as the deployment default.
 * Picking stages; the choice reaches a session when one becomes current.
 */

import { useEffect, useRef, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconAgentPresetOutline16, IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-conversation SlotMap merge (the hero seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AgentPresetSeatState } from './seat-store.ts'
import { presetDisplayText } from './locales.ts'
import css from './AgentPresetSeat.module.css'

/** Registration-side business face for the hero chip. */
export interface AgentPresetSeatInjected {
  hooks: {
    /** Seat snapshot bound by the renderer as useAgentPresetSeat. */
    agentPresetSeat: SnapshotStore<AgentPresetSeatState>
  }
  /** Read the roster when the chip first renders. */
  load: () => Promise<void>
  /** Stage one preset for the next session. */
  select: (id: string) => Promise<void>
  /** Clear the one-shot introduce cue once the chip has played it. */
  introduced: () => void
}

/* Introduce timeline: the icon eases in first (the CSS animation shares this
   duration); the name's characters start fading up the moment it lands, each
   taking the fade duration to settle. The cue clears after the last one. The
   stagger is capped twice: per tick for short CJK names, and by one shared
   reveal window so a long Latin name finishes in the same time as its CJK
   counterpart instead of dragging the run out per character. */
const INTRO_TEXT_DELAY_MS = 150
const INTRO_CHAR_STAGGER_MS = 40
const INTRO_TEXT_REVEAL_MS = 200
const INTRO_CHAR_FADE_MS = 400

/**
 * Per-character start offset for the introduce reveal.
 * @param count - character count of the shown preset name.
 * @returns milliseconds between successive character starts.
 */
function introStaggerMs(count: number): number {
  if (count <= 1) return 0
  return Math.min(INTRO_CHAR_STAGGER_MS, INTRO_TEXT_REVEAL_MS / (count - 1))
}

/** Full component props. */
export type AgentPresetSeatProps =
  PropsRuntime<'conversation.input.agentPreset'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetSeatInjected>

/**
 * Render the new-session agent-preset chip.
 * @param props - composed slot props.
 * @returns the chip, or null when the deployment composes no presets.
 */
export function AgentPresetSeat({
  load, select, introduced, useAgentPresetSeat, t, triggerLabel, triggerClassName, triggerDisabled,
}: AgentPresetSeatProps) {
  const state = useAgentPresetSeat(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const [customModel, setCustomModel] = useState(() => document.body.dataset.hlCustomModel === '1')
  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  // HeightLab：模板「做同款」全联动——先切对应专家，再把模板名插入
  // 输入框（胶囊），由 InputHub 完成插入；不发送。
  const selectRef = useRef(select)
  selectRef.current = select

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onUseTemplate = async (event: Event): Promise<void> => {
      const detail = (event as CustomEvent<{ agentPreset?: unknown; title?: unknown }>).detail
      if (typeof detail?.title !== 'string' || detail.title === '') return
      const preset = typeof detail.agentPreset === 'string' ? detail.agentPreset : ''
      const options = state.options
      if (preset !== '' && options?.some(option => option.id === preset)) {
        try {
          await selectRef.current(preset)
        } catch { /* 非致命：切换失败也照常发送，由 Colin 语义路由 */ }
      }
      window.dispatchEvent(new CustomEvent('hl:insert-template', {
        detail: { title: detail.title },
      }))
    }
    window.addEventListener('hl:use-template', onUseTemplate)
    return () => window.removeEventListener('hl:use-template', onUseTemplate)
  }, [state.options])

  // HeightLab：输入框里的模板胶囊被删光（输入框清空）→ 切回默认 Colin。
  useEffect(() => {
    const onTemplateRemoved = async (): Promise<void> => {
      const options = state.options
      if (options?.some(option => option.id === 'standard')) {
        try {
          await selectRef.current('standard')
        } catch { /* 非致命：会话已开始无法切换时保持现状 */ }
      }
    }
    window.addEventListener('hl:template-removed', onTemplateRemoved)
    return () => window.removeEventListener('hl:template-removed', onTemplateRemoved)
  }, [state.options])

  // HeightLab：自定义模型激活时只能选「通用助手」。
  useEffect(() => {
    const onModel = (event: Event): void => {
      const detail = (event as CustomEvent<{ custom?: boolean }>).detail
      setCustomModel(detail?.custom === true)
    }
    window.addEventListener('hl:model-change', onModel)
    return () => window.removeEventListener('hl:model-change', onModel)
  }, [])

  // HeightLab：轮询「当前工作 Agent」，谁在工作选择框就显示谁。
  useEffect(() => {
    let cancelled = false
    const poll = (): void => {
      fetch('/hl/current-agent')
        .then(response => response.json().catch(() => ({})))
        .then((data: { ok?: boolean; id?: string | null }) => {
          if (!cancelled && data?.ok === true) {
            setActiveAgent(typeof data.id === 'string' && data.id !== '' ? data.id : null)
          }
        })
        .catch(() => { /* 保持原值 */ })
    }
    poll()
    const timer = window.setInterval(poll, 1500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  // HeightLab：创造模式起草会话（cordis）给输入框加极光克莱因蓝边框标识。
  useEffect(() => {
    try {
      if (state.current === 'cordis') {
        document.body.dataset.hlCreator = '1'
      } else {
        delete document.body.dataset.hlCreator
      }
    } catch { /* 非致命 */ }
  }, [state.current])

  // HeightLab：把当前预设广播到 body，供模型选择器做反向校验。
  useEffect(() => {
    try {
      if (state.current) {
        document.body.dataset.hlAgentPreset = state.current
      } else {
        delete document.body.dataset.hlAgentPreset
      }
    } catch { /* 非致命 */ }
  }, [state.current])

  // HeightLab：把当前工作智能体广播到 body，供上下文注入行显示“谁已收到”。
  useEffect(() => {
    try {
      if (activeAgent) {
        document.body.dataset.hlWorkingAgent = activeAgent
      } else {
        delete document.body.dataset.hlWorkingAgent
      }
    } catch { /* 非致命 */ }
  }, [activeAgent])

  const chosen = state.options.find(option => option.id === state.current)
  const chosenText = chosen === undefined ? undefined : presetDisplayText(chosen, t)
  const activeOption = activeAgent === null ? undefined : state.options.find(option => option.id === activeAgent)
  const activeName = activeOption === undefined
    ? (activeAgent ?? undefined)
    : presetDisplayText(activeOption, t).name
  // 只有会话真的在运行时，才用“谁在工作”覆盖当前选择；空闲/首页时
  // 显示用户当前选中的智能体，避免残留的工作者污染选择框。
  const workingLabel = state.running && activeAgent !== null && activeAgent !== state.current
    ? (activeName ?? activeAgent)
    : undefined
  // HeightLab：输入框按钮跟随所选智能体——选中非标准（Colin）预设时
  // 显示该预设名称（如「视频制作专家」），标准模式保持 COLIN。
  const label = workingLabel ?? (
    state.current !== '' && chosen !== undefined && chosen.id !== 'standard'
      ? (chosenText?.name ?? state.current)
      : (triggerLabel ?? chosenText?.name ?? state.current)
  )
  const ready = state.options.length > 0 && state.current !== ''

  // The introduce cue: the pick was staged from another screen (the settings
  // creator entry), so the chip announces it — the icon eases in and each
  // character of the name fades up on a stagger (CSS owns the motion; this
  // effect only arms it and acknowledges the cue once the run is over).
  const [introducing, setIntroducing] = useState(false)
  useEffect(() => {
    if (!state.introduce || !ready) return
    if (triggerLabel) {
      introduced()
      return
    }
    const characters = Array.from(label)
    if (characters.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      introduced()
      return
    }
    setIntroducing(true)
    const done = window.setTimeout(() => {
      setIntroducing(false)
      introduced()
    }, INTRO_TEXT_DELAY_MS + (characters.length - 1) * introStaggerMs(characters.length) + INTRO_CHAR_FADE_MS)
    return () => { window.clearTimeout(done) }
  }, [state.introduce, ready, label, introduced])

  // Nothing to choose between: the deployment composes no presets and every
  // session shares the host composition.
  if (!ready) return null

  // One wrapper span: the chip is a flex row with a gap, so loose character
  // spans would each pick up the gap between them.
  const characters = Array.from(label)
  const stagger = introStaggerMs(characters.length)
  const shownLabel = introducing
    ? (
      <span className={css.introText}>
        {characters.map((character, index) => (
          <span
            key={index}
            className={css.introChar}
            style={{ animationDelay: `${INTRO_TEXT_DELAY_MS + index * stagger}ms` }}
          >
            {character}
          </span>
        ))}
      </span>
    )
    : label

  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={state.options.map((option) => {
        const text = presetDisplayText(option, t)
        return {
          id: option.id,
          // Name and description together: the id alone never says what a
          // preset does, which is why the roster carries display copy.
          label: (
            <span className={css.item} style={customModel && option.id !== 'general-assistant' ? { opacity: 0.45 } : undefined}>
              <span className={css.itemName}>{text.name}</span>
              <span className={css.itemDesc}>{text.description ?? t('noDescription')}</span>
            </span>
          ),
        }
      })}
      selectedId={state.current}
      onSelect={(id) => {
        if (customModel && id !== 'general-assistant') return
        setOpen(false)
        void select(id)
      }}
      {...(customModel
        ? { footer: [{ type: 'label' as const, id: 'custom-model-hint', text: t('customModelHint') }] }
        : {})}
      align="start"
      portal
      className="hl-agent-menu"
      anchor={(
        <button
          type="button"
          className={triggerClassName ?? css.seat}
          aria-haspopup="menu"
          aria-expanded={open}
          title={state.error ?? t('seatHint')}
          disabled={triggerDisabled ?? state.busy}
          onClick={() => { setOpen(value => !value) }}
        >
          {triggerLabel === undefined && (
            <IconAgentPresetOutline16 className={introducing ? `${css.seatIcon} ${css.introIcon}` : css.seatIcon} />
          )}
          {shownLabel}
          {triggerLabel === undefined
            ? <IconChevronDownOutline14 className={css.chevron} />
            : <IconChevronDownOutline14 className={css.chevronOnDark} />}
        </button>
      )}
    />
  )
}
