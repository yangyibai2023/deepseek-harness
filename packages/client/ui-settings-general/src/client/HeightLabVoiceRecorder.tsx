/**
 * HeightLab voice recorder (0.3.0 overlay): a mic button in the composer tool
 * row that opens an in-dialog recorder/uploader. After capture the audio is
 * added to the composer attachment rail (same as images/videos) and only
 * reaches the assistant when the user presses Send — a universal media input,
 * not a voice-clone-specific popup. Voice cloning itself is decided by the
 * assistant (e.g. user says "创建我的声音克隆" alongside the audio).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

interface VoiceRecorderProps {
  input: { draft: string }
  inputActions: {
    setDraft(text: string): void
    addImages(ids: readonly unknown[]): boolean
    submit(): void
  }
  addAudioDraft?: (file: File) => readonly string[] | null
  sessionId: string
}

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  border: 'none',
  background: 'transparent',
  color: 'var(--color-text-2, #666)',
  cursor: 'pointer',
  borderRadius: 8,
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
  width: 'min(400px, 92vw)',
  background: 'var(--color-bg-1, #fff)',
  borderRadius: 14,
  padding: '20px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  boxShadow: '0 16px 60px rgba(0,0,0,0.25)',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  background: '#1f6feb',
  color: '#fff',
}

const ghostButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: 'transparent',
  color: 'inherit',
  border: '1px solid currentColor',
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function HeightLabVoiceRecorder({ inputActions, addAudioDraft, sessionId }: VoiceRecorderProps) {
  const [open, setOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  const mediaRef = useRef<{ stream: MediaStream; recorder: MediaRecorder; chunks: Blob[] } | null>(null)
  const timerRef = useRef<number | null>(null)
  const sessionRef = useRef(sessionId)

  useEffect(() => {
    sessionRef.current = sessionId
  }, [sessionId])

  const stopTracks = useCallback(() => {
    if (mediaRef.current === null) return
    for (const track of mediaRef.current.stream.getTracks()) track.stop()
    mediaRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
      stopTracks()
    }
  }, [stopTracks])

  const close = useCallback(() => {
    if (recording || uploading) return
    setOpen(false)
    setError(null)
    setAdded(false)
    setElapsed(0)
    stopTracks()
  }, [recording, uploading, stopTracks])

  const addToComposer = useCallback((file: File): boolean => {
    if (addAudioDraft === undefined) {
      setError('当前会话暂不支持添加音频附件，请稍后重试。')
      return false
    }
    const ids = addAudioDraft(file)
    if (ids === null || ids.length === 0) {
      setError('音频格式不支持或添加失败，请重试。')
      return false
    }
    // 附件 id 是运行时品牌类型，这里按结构透传给输入机。
    inputActions.addImages(ids as unknown as readonly never[])
    return true
  }, [addAudioDraft, inputActions])

  const captureDone = useCallback((blob: Blob, filename: string) => {
    const file = new File([blob], filename, { type: blob.type || 'audio/mp4' })
    if (addToComposer(file)) {
      setAdded(true)
      setError(null)
      window.setTimeout(() => {
        setOpen(false)
        setAdded(false)
        setElapsed(0)
      }, 900)
    }
  }, [addToComposer])

  const beginRecording = useCallback(async () => {
    setError(null)
    setAdded(false)
    try {
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('当前环境不支持录音，请改为上传音频文件。')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferred = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
      const mimeType = preferred.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      } catch {
        for (const track of stream.getTracks()) track.stop()
        setError('当前浏览器不支持录音编码，请改为上传音频文件。')
        return
      }
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        const type = mimeType || 'audio/mp4'
        const isM4A = type.includes('mp4')
        captureDone(new Blob(chunks, { type }), isM4A ? 'recording.m4a' : 'recording.webm')
      }
      mediaRef.current = { stream, recorder, chunks }
      recorder.start()
      setRecording(true)
      setElapsed(0)
      timerRef.current = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        setError('麦克风权限被拒绝，请在系统设置中允许 HeightLab 访问麦克风，或改为上传音频文件。')
      } else {
        setError('无法访问麦克风，请检查系统录音权限，或改为上传音频文件。')
      }
    }
  }, [captureDone])

  const stopRecording = useCallback(() => {
    if (mediaRef.current === null) return
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    mediaRef.current.recorder.stop()
    setRecording(false)
  }, [])

  const onFile = useCallback((file: File | undefined) => {
    setError(null)
    setAdded(false)
    if (file === undefined) return
    if (file.size > 20 * 1024 * 1024) {
      setError('音频文件过大（最大 20MB）。')
      return
    }
    setUploading(true)
    window.setTimeout(() => {
      captureDone(file, file.name)
      setUploading(false)
    }, 50)
  }, [captureDone])

  return (
    <>
      <button
        type="button"
        title="录音或上传音频"
        aria-label="录音或上传音频"
        style={buttonStyle}
        onClick={() => { setError(null); setAdded(false); setOpen(true) }}
      >
        <MicIcon />
      </button>
      {open && (
        <div style={overlayStyle} onClick={() => { if (!recording && !uploading) close() }}>
          <div style={panelStyle} role="dialog" aria-label="录音或上传音频" onClick={(event) => event.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>录音 / 上传音频</div>
            <div style={{ opacity: 0.65, fontSize: 12 }}>
              录完或选完后会添加到输入框，和图片/视频一样，点发送才发出。发的时候可以告诉助手你想做什么（例如“创建我的声音克隆”）。
            </div>
            {recording ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#d64545', fontWeight: 700 }}>{formatTime(elapsed)}</span>
                <button type="button" style={primaryButtonStyle} onClick={stopRecording}>
                  停止并添加
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" style={primaryButtonStyle} disabled={uploading} onClick={() => { void beginRecording() }}>
                  {uploading ? '处理中…' : '开始录音'}
                </button>
                <label style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', cursor: uploading ? 'default' : 'pointer' }}>
                  {uploading ? '处理中…' : '选择音频文件'}
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a"
                    style={{ display: 'none' }}
                    disabled={uploading}
                    onChange={(event) => onFile(event.target.files?.[0])}
                  />
                </label>
              </div>
            )}
            {error && <div style={{ fontSize: 13, color: '#d64545' }}>{error}</div>}
            {added && <div style={{ fontSize: 13, color: '#1f9d55' }}>已添加到输入框，点发送即可。</div>}
            <div style={{ textAlign: 'right' }}>
              <button type="button" style={ghostButtonStyle} disabled={recording || uploading} onClick={close}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
