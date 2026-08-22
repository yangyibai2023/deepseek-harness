/**
 * HeightLab：模板大图预览（点击卡片放大）。
 *
 * 覆盖层展示模板大图 + 标题/说明；操作：
 * 「做同款」=直接发送开始（全联动：切专家 + 技能 + MCP + 模板标记）；
 * 「关闭」。
 */

import { useEffect } from 'react'
import type { Recommendation } from './HeightLabTemplates.ts'
import { templateThumb } from './HeightLabTemplates.ts'

const actionStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.35)',
  background: 'rgba(255,255,255,0.16)',
  color: '#fff',
  borderRadius: 10,
  padding: '8px 18px',
  fontSize: 13,
  cursor: 'pointer',
}

const primaryStyle: React.CSSProperties = {
  ...actionStyle,
  background: '#fff',
  color: '#111',
  borderColor: '#fff',
  fontWeight: 600,
}

export function TemplatePreview({ item, onClose, onSame }: {
  item: Recommendation
  onClose: () => void
  onSame: () => void
}) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: 24,
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <img
        src={templateThumb(item)}
        alt={item.title}
        style={{
          maxWidth: '82%',
          maxHeight: '68vh',
          objectFit: 'contain',
          borderRadius: 16,
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
        }}
        onClick={event => event.stopPropagation()}
      />
      <div
        style={{ textAlign: 'center', color: '#fff' }}
        onClick={event => event.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: '24px' }}>{item.title}</div>
        <div style={{ fontSize: 13, opacity: 0.7, lineHeight: '20px', marginTop: 4 }}>{item.desc}</div>
      </div>
      <div style={{ display: 'flex', gap: 10 }} onClick={event => event.stopPropagation()}>
        <button type="button" style={primaryStyle} onClick={onSame}>
          做同款
        </button>
        <button type="button" style={actionStyle} onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}
