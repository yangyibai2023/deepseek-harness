/**
 * HeightLab 用户反馈（P1）：设置→关于→问题反馈。
 * 匿名可提交（可选联系方式）；提交到云端反馈队列，后台运营查看。
 */
import { useState } from 'react'

const CLOUD_BASE = 'https://www.heightlabai.com'

const sectionStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 10,
  background: 'var(--dsw-alias-fill-secondary, rgba(127,127,127,0.08))',
  marginTop: 12,
}

export function HeightLabFeedback() {
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (!content.trim() || busy) return
    setBusy(true)
    setStatus(null)
    try {
      const r = await fetch(`${CLOUD_BASE}/api/telemetry/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, contact }),
      })
      const data = (await r.json()) as { ok?: boolean }
      if (data.ok) {
        setStatus('已提交，感谢反馈！')
        setContent('')
        setContact('')
      } else {
        setStatus('提交失败，请稍后重试')
      }
    } catch {
      setStatus('提交失败，请检查网络')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>问题反馈</div>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder='遇到问题或有建议？写下来发给我们（可附联系方式方便回复）'
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8,
          border: '1px solid var(--dsw-alias-separator, rgba(127,127,127,0.3))',
          background: 'transparent', color: 'inherit', fontSize: 12, resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <input
          value={contact}
          onChange={e => setContact(e.target.value)}
          placeholder='联系方式（选填）'
          style={{
            flex: 1, padding: '6px 8px', borderRadius: 8,
            border: '1px solid var(--dsw-alias-separator, rgba(127,127,127,0.3))',
            background: 'transparent', color: 'inherit', fontSize: 12,
          }}
        />
        <button
          type='button'
          onClick={() => { void submit() }}
          disabled={busy || !content.trim()}
          style={{
            padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--dsw-alias-button-primary-fill, #2eaadc)',
            color: 'var(--dsw-alias-label-primary-foreground, #fff)', fontSize: 12,
            opacity: busy || !content.trim() ? 0.5 : 1,
          }}
        >
          {busy ? '提交中…' : '提交反馈'}
        </button>
      </div>
      {status !== null && <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>{status}</div>}
    </div>
  )
}
