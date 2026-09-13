/**
 * HeightLab voice section (0.3.0 overlay): list the user's own cloned voices,
 * create a new one (record or upload), play the source sample, and delete
 * (archive). Creation is free; only TTS usage is billed normally. Backed by
 * heightlab-host-api routes (/hl/voices, /hl/voices/status) with the session
 * token held by the host.
 */
import { useEffect, useRef, useState } from 'react'

interface VoiceItem {
  voice_reference: string
  name?: string | null
  status: string
  preview_url?: string | null
}

const sectionStyle: React.CSSProperties = {
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '10px 12px',
  border: '1px solid rgba(127,127,127,0.25)',
  borderRadius: '8px',
}

const audioStyle: React.CSSProperties = {
  height: 32,
  maxWidth: 220,
  borderRadius: 6,
}

const buttonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: '8px',
  border: '1px solid currentColor',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 13,
  whiteSpace: 'nowrap',
}

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#1f6feb',
  borderColor: '#1f6feb',
  color: '#fff',
  fontWeight: 600,
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.45)',
}

const panelStyle: React.CSSProperties = {
  width: 'min(420px, 92vw)',
  background: 'var(--color-bg-1, #fff)',
  borderRadius: 14,
  padding: '20px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  boxShadow: '0 16px 60px rgba(0,0,0,0.25)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(127,127,127,0.35)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 13,
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ready': return '可用'
    case 'training': return '克隆中'
    case 'failed': return '克隆失败'
    case 'deleting': return '删除中'
    case 'deleted': return '已删除'
    default: return status
  }
}

function shortRef(ref: string): string {
  return ref.length > 20 ? `${ref.slice(0, 10)}…${ref.slice(-6)}` : ref
}

export function HeightLabVoices() {
  const [items, setItems] = useState<VoiceItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyRef, setBusyRef] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioPreview, setAudioPreview] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const mediaRef = useRef<{ stream: MediaStream; recorder: MediaRecorder; chunks: Blob[] } | null>(null)
  const timerRef = useRef<number | null>(null)

  const refresh = (): void => {
    fetch('/hl/voices')
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setItems(Array.isArray(data.items) ? data.items : [])
          setError(null)
        } else {
          setItems([])
          setError(data?.message ?? '声音加载失败')
        }
      })
      .catch(() => { setItems([]); setError('声音加载失败，请稍后重试') })
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
      if (mediaRef.current !== null) {
        for (const track of mediaRef.current.stream.getTracks()) track.stop()
        mediaRef.current = null
      }
    }
  }, [])

  // 有克隆中的声音时每 10 秒自动刷新一次（后台 sweeper 会自动推进）。
  useEffect(() => {
    if (!items.some((item) => item.status === 'training')) return
    const timer = window.setInterval(refresh, 10_000)
    return () => window.clearInterval(timer)
  }, [items])

  const stopTracks = (): void => {
    if (mediaRef.current === null) return
    for (const track of mediaRef.current.stream.getTracks()) track.stop()
    mediaRef.current = null
  }

  const startRecord = async (): Promise<void> => {
    setCreateError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm'
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
        const blob = new Blob(chunks, { type })
        const file = new File([blob], `录音-${Date.now()}.${ext}`, { type })
        setAudioFile(file)
        setAudioPreview(URL.createObjectURL(blob))
      }
      mediaRef.current = { stream, recorder, chunks }
      recorder.start()
      setRecording(true)
      setElapsed(0)
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch {
      setCreateError('无法访问麦克风，请使用「上传音频文件」方式。')
    }
  }

  const stopRecord = (): void => {
    if (mediaRef.current === null) return
    mediaRef.current.recorder.stop()
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    stopTracks()
    setRecording(false)
  }

  const pickAudio = (file: File | undefined): void => {
    setCreateError(null)
    if (!file || !file.type.startsWith('audio/')) {
      setCreateError('请选择音频文件。')
      return
    }
    setAudioFile(file)
    setAudioPreview(URL.createObjectURL(file))
  }

  const create = async (): Promise<void> => {
    setCreateError(null)
    if (!audioFile) {
      setCreateError('请先录音或选择一段音频。')
      return
    }
    setCreating(true)
    try {
      const form = new FormData()
      form.append('audio', audioFile, audioFile.name)
      form.append('title', (createName.trim() || '我的声音').slice(0, 30))
      const res = await fetch('/hl/voices', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean
        message?: string
        voice_reference?: string
      }
      if (!res.ok || data?.ok !== true || !data.voice_reference) {
        setCreateError(data?.message ?? '声音克隆创建失败，请稍后重试。')
        return
      }
      const ref = data.voice_reference
      for (let i = 0; i < 60; i += 1) {
        await new Promise((r) => window.setTimeout(r, 5_000))
        try {
          const sr = await fetch('/hl/voices/status', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ voice_reference: ref }),
          })
          const sdata = await sr.json().catch(() => ({})) as { ok?: boolean; status?: string }
          if (sdata?.status === 'ready' || sdata?.status === 'failed') break
        } catch {
          // 继续轮询
        }
      }
      refresh()
      setCreateOpen(false)
      setCreateName('')
      setAudioFile(null)
      setAudioPreview(null)
    } catch {
      setCreateError('声音克隆创建失败，请稍后重试。')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (ref: string): Promise<void> => {
    if (!window.confirm('确定删除该声音克隆吗？删除后不可恢复。')) return
    setBusyRef(ref)
    try {
      const r = await fetch(`/hl/voices/${encodeURIComponent(ref)}`, { method: 'DELETE' })
      const data = await r.json().catch(() => ({}))
      if (data?.ok) {
        refresh()
      } else {
        window.alert(data?.message ?? '删除失败，请稍后重试。')
      }
    } catch {
      window.alert('删除失败，请稍后重试。')
    } finally {
      setBusyRef(null)
    }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600 }}>声音</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>我的声音克隆（创建免费，新建后可直接在对话中使用）</div>
        </div>
        {/* HeightLab：新建声音用原生描边按钮，不用蓝色主按钮。 */}
        <button type="button" style={buttonStyle} onClick={() => { setCreateOpen(true); setCreateError(null); setAudioFile(null); setAudioPreview(null) }}>
          新建声音
        </button>
      </div>
      {error && <div style={{ opacity: 0.8, fontSize: 13, color: '#d64545' }}>{error}</div>}
      {!error && items.length === 0 && (
        <div style={{ opacity: 0.6, fontSize: 13 }}>还没有声音克隆，点击「新建声音」录制或上传一段音频即可。</div>
      )}
      {items.map((item) => (
        <div key={item.voice_reference} style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name ?? `声音 ${shortRef(item.voice_reference)}`}
              </div>
              <div style={{ opacity: 0.7, fontSize: 12, fontFamily: 'monospace' }}>{shortRef(item.voice_reference)}</div>
              <div style={{ opacity: 0.7, fontSize: 12 }}>{statusLabel(item.status)}</div>
            </div>
            {item.preview_url && item.status === 'ready' && (
              <audio controls preload="none" src={item.preview_url} style={audioStyle} />
            )}
          </div>
          <button
            type="button"
            style={buttonStyle}
            disabled={busyRef === item.voice_reference}
            onClick={() => { void remove(item.voice_reference) }}
          >
            {busyRef === item.voice_reference ? '删除中…' : '删除'}
          </button>
        </div>
      ))}
      {createOpen && (
        <div style={overlayStyle} onClick={() => { if (!creating && !recording) setCreateOpen(false) }}>
          <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>新建声音克隆</div>
            <div style={{ opacity: 0.7, fontSize: 13 }}>
              录制或上传一段你的声音（10-30 秒清晰人声效果最佳），克隆创建免费。
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {!recording ? (
                <button type="button" style={primaryButtonStyle} onClick={() => { void startRecord() }}>
                  开始录音
                </button>
              ) : (
                <button type="button" style={{ ...primaryButtonStyle, background: '#d64545', borderColor: '#d64545' }} onClick={stopRecord}>
                  停止录音（{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}）
                </button>
              )}
              <label style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                上传音频文件
                <input
                  type="file"
                  accept="audio/*"
                  style={{ display: 'none' }}
                  onChange={(e) => pickAudio(e.target.files?.[0])}
                />
              </label>
            </div>
            {audioPreview && (
              <audio controls preload="none" src={audioPreview} style={{ width: '100%', height: 36 }} />
            )}
            <input
              type="text"
              value={createName}
              placeholder="声音名字（可选，例如：我的声音）"
              style={inputStyle}
              maxLength={30}
              onChange={(e) => setCreateName(e.target.value)}
            />
            {createError && <div style={{ color: '#d64545', fontSize: 13 }}>{createError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                style={buttonStyle}
                disabled={creating || recording}
                onClick={() => setCreateOpen(false)}
              >
                取消
              </button>
              <button type="button" style={primaryButtonStyle} disabled={creating || recording} onClick={() => { void create() }}>
                {creating ? '创建中…' : '开始创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
