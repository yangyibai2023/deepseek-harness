/**
 * HeightLab「关于」设置页（0.3.0 overlay）：应用名/版本、软件介绍、
 * 检查更新 + 下载进度。更新能力走共享 store（hl_check_update /
 * hl_install_update，进度经 hl://update-progress 事件推送），与侧边栏
 * 「更新」胶囊保持同步。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  checkForUpdate, getUpdateState, installUpdate, subscribeUpdateState,
} from './heightlab-update-store.ts'

interface AppInfo {
  name?: string
  version?: string
  platform?: string
}

const sectionStyle: React.CSSProperties = {
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  maxWidth: '560px',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '8px',
  border: '1px solid currentColor',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 13,
}

const introStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: '20px',
  opacity: 0.82,
  whiteSpace: 'pre-line',
}

const cardStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '14px',
  background: 'var(--dsw-alias-bg-layer-2)',
  border: '1px solid var(--dsw-alias-border-l2)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}

const progressTrackStyle: React.CSSProperties = {
  width: '100%',
  height: 6,
  borderRadius: 3,
  background: 'var(--color-surface-hover, #eee)',
  overflow: 'hidden',
}

export function HeightLabAbout() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  // HeightLab：与侧边栏「更新」胶囊共用同一份更新状态（0.3.8）。
  const updateState = useSyncExternalStore(subscribeUpdateState, getUpdateState)

  useEffect(() => {
    fetch('/hl/app-info')
      .then((r) => r.json())
      .then((data) => { if (data?.ok) setInfo(data) })
      .catch(() => { /* 保持默认 */ })
  }, [])

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{info?.name ?? 'HeightLab'}</span>
        {info?.version !== undefined && (
          <span style={{ fontSize: 12, opacity: 0.55, fontWeight: 400 }}>
            v{info.version}
          </span>
        )}
      </div>
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.95 }}>
          一句话，启动你的营销引擎
        </div>
        <div style={introStyle}>
          {`HeightLab 是一个面向内容创作与商业落地的一站式 AI 工作台：

· Colin 指挥官 —— 理解你的目标，自动拆解任务，调度最合适的专家
· 专家矩阵 —— 文案创作、图片、视频、数字人、研究分析，各司其职
· 全栈创作 —— 从文案到配图、从口播到成片，一次对话全部完成
· 主流模型自由选 —— 文本 / 图片 / 视频分类切换，随时换到顺手的那一个
· 内容资产沉淀 —— 素材库与知识库统一管理，越用越懂你`}
        </div>
      </div>
      <div style={rowStyle}>
        <button type="button" style={buttonStyle} disabled={updateState.phase === 'checking' || updateState.busy} onClick={() => { void checkForUpdate() }}>
          {updateState.phase === 'checking' ? '检查中…' : '检查更新'}
        </button>
        {updateState.info !== null && !updateState.busy && (
          <button
            type="button"
            style={{
              ...buttonStyle,
              background: 'var(--dsw-alias-button-primary-fill)',
              color: 'var(--dsw-alias-label-primary-foreground)',
              borderColor: 'transparent',
              fontWeight: 600,
            }}
            onClick={() => { void installUpdate() }}
          >
            更新
          </button>
        )}
      </div>
      {updateState.busy && (
        <div style={progressTrackStyle}>
          <div style={{ width: `${updateState.progress}%`, height: '100%', background: 'var(--dsw-alias-button-primary-fill)', transition: 'width 120ms linear' }} />
        </div>
      )}
      {updateState.message !== null && <div style={{ fontSize: 12, opacity: 0.7 }}>{updateState.message}</div>}
      {updateState.info?.body !== undefined && updateState.info.body !== '' && (
        <div style={{ fontSize: 12, opacity: 0.7, whiteSpace: 'pre-line' }}>{updateState.info.body}</div>
      )}
    </div>
  )
}
