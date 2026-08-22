/**
 * HeightLab 人物资产 section (0.3.1): 用户录制的 5-15s 短视频人物
 * （形象 + 动作 + 声音一体），列表 / 上传 / 删除。生成剧情时作为
 * H3 的参考视频 + 参考声音使用。Backed by /hl/characters。
 */
import { useEffect, useRef, useState } from 'react'

interface CharacterItem {
  character_reference: string
  name?: string | null
  video_url?: string | null
  audio_url?: string | null
  frame_urls?: string[] | null
  photo_urls?: string[] | null
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

const videoStyle: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 8,
  objectFit: 'cover',
  background: 'rgba(127,127,127,0.08)',
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

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.65,
  lineHeight: 1.6,
}

function CharacterThumb({ item }: { item: CharacterItem }) {
  const [failed, setFailed] = useState(false)
  const frame = Array.isArray(item.frame_urls) && item.frame_urls.length > 0 ? item.frame_urls[0] : null
  if (failed) {
    return (
      <div style={{ ...videoStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
        🎬
      </div>
    )
  }
  if (frame) {
    return (
      <img
        src={frame}
        alt={item.name ?? '人物'}
        style={videoStyle}
        onError={() => setFailed(true)}
      />
    )
  }
  if (item.video_url) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={`${item.video_url}#t=0.1`}
        style={videoStyle}
        muted
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div style={{ ...videoStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
      🎬
    </div>
  )
}

export function HeightLabCharacters() {
  const [items, setItems] = useState<CharacterItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyRef, setBusyRef] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [moreRef, setMoreRef] = useState<string | null>(null)
  const [morePhotos, setMorePhotos] = useState<string[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [nameModalOpen, setNameModalOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [pendingName, setPendingName] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const refresh = (): void => {
    fetch('/hl/characters')
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setItems(Array.isArray(data.items) ? data.items : [])
          setError(null)
        } else {
          setItems([])
          setError(data?.message ?? '人物资产加载失败')
        }
      })
      .catch(() => { setItems([]); setError('人物资产加载失败，请稍后重试') })
  }

  useEffect(() => { refresh() }, [])

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(file)
      })
      const res = await fetch('/hl/characters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          video_base64: base64,
          filename: file.name,
          name: (pendingName.trim() || file.name.replace(/\.[^.]+$/, '')).slice(0, 30),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        setUploadError(data?.message ?? '人物创建失败，请稍后重试')
        return
      }
      refresh()
    } catch {
      setUploadError('人物创建失败，请稍后重试')
    } finally {
      setUploading(false)
      setPendingName('')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const openNameModal = (): void => {
    setCreateName('')
    setNameModalOpen(true)
  }

  const confirmName = (): void => {
    setPendingName(createName.trim())
    setNameModalOpen(false)
    inputRef.current?.click()
  }

  const openMore = (item: CharacterItem): void => {
    setMoreRef(item.character_reference)
    setMorePhotos(Array.isArray(item.photo_urls) ? item.photo_urls : [])
    setPhotoError(null)
  }

  const onPhotos = async (files: FileList | null | undefined): Promise<void> => {
    if (!files || files.length === 0 || moreRef === null) return
    setPhotoUploading(true)
    setPhotoError(null)
    try {
      for (const file of Array.from(files).slice(0, 9)) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result ?? ''))
          reader.onerror = () => reject(new Error('read failed'))
          reader.readAsDataURL(file)
        })
        const res = await fetch(`/hl/characters/${encodeURIComponent(moreRef)}/photos`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image_base64: base64, filename: file.name }),
        })
        const data = await res.json()
        if (!res.ok || !data?.ok) {
          setPhotoError(data?.message ?? '照片添加失败，请稍后重试')
          return
        }
        setMorePhotos(prev => [...prev, data.photo_url as string])
      }
      refresh()
    } catch {
      setPhotoError('照片添加失败，请稍后重试')
    } finally {
      setPhotoUploading(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const removePhoto = async (photoUrl: string): Promise<void> => {
    if (moreRef === null) return
    const photoRef = photoUrl.split('/').pop()?.replace(/\.(png|jpe?g|webp|heic|heif)$/i, '') ?? ''
    const res = await fetch(
      `/hl/characters/${encodeURIComponent(moreRef)}/photos/${encodeURIComponent(photoRef)}`,
      { method: 'DELETE' },
    )
    if (res.ok) {
      setMorePhotos(prev => prev.filter(u => u !== photoUrl))
      refresh()
    }
  }

  const remove = async (ref: string): Promise<void> => {
    setBusyRef(ref)
    try {
      const res = await fetch(`/hl/characters/${encodeURIComponent(ref)}`, { method: 'DELETE' })
      if (res.ok) refresh()
    } finally {
      setBusyRef(null)
    }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>人物资产</div>
          <div style={hintStyle}>录一段 5-15 秒正面短视频，形象、动作和声音一次保存，可反复用于剧情生成。</div>
        </div>
        <button type="button" style={primaryButtonStyle} onClick={openNameModal} disabled={uploading}>
          {uploading ? '上传中…' : '＋ 上传人物'}
        </button>
      </div>
      {nameModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}>
          <div style={{ width: 'min(360px, 90vw)', background: 'var(--color-bg-1, #fff)', borderRadius: 14, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 16px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontWeight: 600 }}>创建人物</div>
            <div style={hintStyle}>给这个人物起个名字，方便以后在输入框里认出他/她。</div>
            <input
              autoFocus
              value={createName}
              placeholder="人物名字（例如：王相宜）"
              maxLength={30}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent', color: 'inherit', fontSize: 13 }}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmName() }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" style={buttonStyle} onClick={() => setNameModalOpen(false)}>取消</button>
              <button type="button" style={primaryButtonStyle} onClick={confirmName} disabled={createName.trim() === ''}>
                确认并选择视频
              </button>
            </div>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        hidden
        onChange={(e) => { void onFile(e.target.files?.[0]) }}
      />
      {uploadError !== null && <div style={{ color: '#e5534b', fontSize: 12 }}>{uploadError}</div>}
      {error !== null && <div style={{ color: '#e5534b', fontSize: 12 }}>{error}</div>}
      {items.length === 0 && error === null && (
        <div style={hintStyle}>还没有人物资产，上传第一段人物视频后即可在输入框的「人物资产」中选择。</div>
      )}
      {items.map((item) => (
        <div key={item.character_reference} style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <CharacterThumb item={item} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name ?? item.character_reference}</div>
              <div style={hintStyle}>{item.audio_url ? '含声音' : '无声'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={buttonStyle} onClick={() => openMore(item)}>更多</button>
            <button
              type="button"
              style={buttonStyle}
              disabled={busyRef === item.character_reference}
              onClick={() => { void remove(item.character_reference) }}
            >
              {busyRef === item.character_reference ? '删除中…' : '删除'}
            </button>
          </div>
        </div>
      ))}
      {moreRef !== null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}>
          <div style={{ width: 'min(460px, 92vw)', background: 'var(--color-bg-1, #fff)', borderRadius: 14, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 16px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontWeight: 600 }}>人物补充照片</div>
            <div style={hintStyle}>可选：上传本人多张照片（正面/侧面/全身），添加后人物会更准确。</div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
              multiple
              hidden
              onChange={(e) => { void onPhotos(e.target.files) }}
            />
            <button type="button" style={primaryButtonStyle} onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>
              {photoUploading ? '上传中…' : '＋ 添加照片（可多选）'}
            </button>
            {photoError !== null && <div style={{ color: '#e5534b', fontSize: 12 }}>{photoError}</div>}
            {morePhotos.length === 0 && <div style={hintStyle}>还没有补充照片。</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {morePhotos.map(url => (
                <div key={url} style={{ position: 'relative' }}>
                  <img src={url} alt="" style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(127,127,127,0.25)' }} />
                  <button
                    type="button"
                    aria-label="删除照片"
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: '1px solid rgba(127,127,127,0.4)', background: 'rgba(0,0,0,0.7)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '18px' }}
                    onClick={() => { void removePhoto(url) }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" style={buttonStyle} onClick={() => setMoreRef(null)}>完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
