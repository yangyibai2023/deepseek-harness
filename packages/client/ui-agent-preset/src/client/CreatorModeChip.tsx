/**
 * HeightLab：新会话页「创造 Agent」开关。
 *
 * 放在工作区（文件夹）芯片旁边；点击进入 / 退出创造模式（cordis preset）。
 * 进入后输入框套极光克莱因蓝边框（body[data-hl-creator] 由本组件与
 * AgentPresetSeat / AgentPresetLabel 共同维护）。只在空白会话可切换，
 * 会话一旦开始，宿主会拒绝换预设（agent-preset-locked）。
 */

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentPresetSeatInjected } from './AgentPresetSeat.tsx'

/** Full component props. */
export type CreatorModeChipProps =
  PropsRuntime<'conversation.hero.agentPreset'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetSeatInjected>

/**
 * Render the creator-mode toggle beside the workspace chip.
 * @param props - composed slot props.
 * @returns the chip, or null when the deployment composes no presets.
 */
export function CreatorModeChip({ useAgentPresetSeat, select, t }: CreatorModeChipProps) {
  const state = useAgentPresetSeat(snapshot => snapshot)
  const active = state.current === 'cordis'
  const [customModel, setCustomModel] = useState(() => document.body.dataset.hlCustomModel === '1')

  useEffect(() => {
    const onModel = (event: Event): void => {
      const detail = (event as CustomEvent<{ custom?: boolean }>).detail
      setCustomModel(detail?.custom === true)
    }
    window.addEventListener('hl:model-change', onModel)
    return () => window.removeEventListener('hl:model-change', onModel)
  }, [])

  // 与 seat 同步极光标记（seat 自己也维护，双保险；切换后 current 会更新）。
  useEffect(() => {
    try {
      if (active) {
        document.body.dataset.hlCreator = '1'
      } else {
        delete document.body.dataset.hlCreator
      }
    } catch { /* 非致命 */ }
  }, [active])

  // HeightLab：创造 Agent 开关平常隐藏；只有通过「设置 → 自定义 →
  // 通过对话创建」（把 cordis 置为当前预设）时才显示，退出创造模式即再次隐藏。
  if (state.options.length === 0 || !active) return null
  // HeightLab：自定义模型只支持通用助手，隐藏创造模式开关。
  if (customModel) return null

  const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 28,
    padding: '0 8px',
    border: 'none',
    borderRadius: 16,
    background: 'transparent',
    color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
    cursor: 'pointer',
    fontSize: 13,
    lineHeight: '20px',
  }

  return (
    <button
      type="button"
      style={chipStyle}
      title={active ? t('creatorChipExit') : t('creatorChipEnter')}
      aria-pressed={active}
      onClick={() => { void select(active ? 'standard' : 'cordis') }}
    >
      {t('creatorChip')}
    </button>
  )
}
