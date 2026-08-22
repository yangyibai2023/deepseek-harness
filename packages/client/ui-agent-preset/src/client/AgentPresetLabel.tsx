/**
 * The session header's agent-preset label.
 *
 * Read-only by construction: a session's composition is fixed once its
 * conversation starts, and a header is only worth reading after that. Offering
 * a control here would promise a switch the host refuses; naming what the
 * session runs is the honest affordance, and the choice itself lives on the
 * new-session screen ({@link AgentPresetSeat}).
 */

import { useEffect } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconAgentPresetOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-conversation SlotMap merge (the header actions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AgentPresetSettingsState } from './settings-store.ts'
import { presetDisplayText } from './locales.ts'
import css from './AgentPresetLabel.module.css'

/** Registration-side business face for the header label. */
export interface AgentPresetLabelInjected {
  hooks: {
    /** Roster snapshot bound by the renderer as useAgentPresets. */
    agentPresets: SnapshotStore<AgentPresetSettingsState>
  }
  /** Read the roster, so the label can show a name rather than an id. */
  load: () => Promise<void>
}

/** Full component props. */
export type AgentPresetLabelProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetLabelInjected>

/**
 * Render this session's agent-preset name beside its title.
 * @param props - composed slot props.
 * @returns the label, or null when the session records no preset.
 */
export function AgentPresetLabel({
  sessionId, useSessions, useAgentPresets, load, t,
}: AgentPresetLabelProps) {
  const preset = useSessions(state => state.byId[sessionId]?.agentPreset)
  const options = useAgentPresets(state => state.options)

  useEffect(() => {
    // Deployments that compose no presets never label anything, so the roster
    // is only worth a request once a session reports one.
    if (preset !== undefined) void load()
  }, [preset, load])

  // HeightLab：创造模式起草会话（cordis）给输入框加极光克莱因蓝边框标识。
  useEffect(() => {
    try {
      if (preset === 'cordis') {
        document.body.dataset.hlCreator = '1'
      } else {
        delete document.body.dataset.hlCreator
      }
      if (preset !== undefined) {
        document.body.dataset.hlAgentPreset = preset
      } else {
        delete document.body.dataset.hlAgentPreset
      }
    } catch { /* 非致命 */ }
  }, [preset])

  if (preset === undefined) return null

  // HeightLab：创造模式在会话标题栏展示自己的「创造 Agent」标签（灰色
  // 星光 SVG + 中文名），不再显示 DSH 原生图标与 cordis 字样。
  if (preset === 'cordis') {
    return (
      <span className={css.label} title={t('creatorChipExit')}>
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          className={css.icon}
          fill="none"
          aria-hidden="true"
        >
          <path d="M8 2.5 9 5.8 12.5 7 9 8.2 8 11.5 7 8.2 3.5 7 7 5.8Z" fill="currentColor" />
          <path d="M12.6 10.4 13 11.7 14.3 12.1 13 12.5 12.6 13.8 12.2 12.5 10.9 12.1 12.2 11.7Z" fill="currentColor" />
          <path d="M4.1 10.5 4.5 11.7 5.7 12.1 4.5 12.5 4.1 13.7 3.7 12.5 2.5 12.1 3.7 11.7Z" fill="currentColor" />
        </svg>
        {t('creatorChip')}
      </span>
    )
  }

  const option = options.find(entry => entry.id === preset)
  const text = option === undefined ? undefined : presetDisplayText(option, t)
  return (
    <span className={css.label} title={text?.description ?? t('headerHint')}>
      <IconAgentPresetOutline16 size={14} className={css.icon} />
      {text?.name ?? preset}
    </span>
  )
}
