/**
 * HeightLab 场景资产 section (0.3.1): 用户上传的场景图片（店铺/外景/古风等），
 * 列表 / 上传 / 删除。生成剧情时作为 H3 的场景参考图使用。
 * Backed by /hl/scenes。
 */
import { useEffect, useRef, useState } from 'react'

interface SceneItem {
  scene_reference: string
  name?: string | null
  image_url?: string | null
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

const imgStyle: React.CSSProperties = {
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

function SceneThumb({ item }: { item: SceneItem }) {
  const [failed, setFailed] = useState(false)
  if (item.image_url && !failed) {
    return (
      <img
        src={item.image_url}
        alt={item.name ?? item.scene_reference}
        style={imgStyle}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div style={{ ...imgStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
      🖼️
    </div>
  )
}

export function HeightLabScenes() {
  const [items, setItems] = useState<SceneItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyRef, setBusyRef] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const refresh = (): void => {
    fetch('/hl/scenes')
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setItems(Array.isArray(data.items) ? data.items : [])
          setError(null)
        } else {
          setItems([])
          setError(data?.message ?? '场景资产加载失败')
        }
      })
      .catch(() => { setItems([]); setError('场景资产加载失败，请稍后重试') })
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
      const res = await fetch('/hl/scenes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          filename: file.name,
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 30),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        setUploadError(data?.message ?? '场景创建失败，请稍后重试')
        return
      }
      refresh()
    } catch {
      setUploadError('场景创建失败，请稍后重试')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (ref: string): Promise<void> => {
    setBusyRef(ref)
    try {
      const res = await fetch(`/hl/scenes/${encodeURIComponent(ref)}`, { method: 'DELETE' })
      if (res.ok) refresh()
    } finally {
      setBusyRef(null)
    }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>场景</div>
          <div style={hintStyle}>上传你的店铺、外景、古风等场景图片，生成剧情时人物可以出现在其中。</div>
        </div>
        <button type="button" style={primaryButtonStyle} onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? '上传中…' : '＋ 上传场景'}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
        hidden
        onChange={(e) => { void onFile(e.target.files?.[0]) }}
      />
      {uploadError !== null && <div style={{ color: '#e5534b', fontSize: 12 }}>{uploadError}</div>}
      {error !== null && <div style={{ color: '#e5534b', fontSize: 12 }}>{error}</div>}
      {items.length === 0 && error === null && (
        <div style={hintStyle}>还没有场景，上传第一张场景图片后即可在输入框的「人物资产」中选择。</div>
      )}
      {items.map((item) => (
        <div key={item.scene_reference} style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <SceneThumb item={item} />
            <div style={{ minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.name ?? item.scene_reference}
            </div>
          </div>
          <button
            type="button"
            style={buttonStyle}
            disabled={busyRef === item.scene_reference}
            onClick={() => { void remove(item.scene_reference) }}
          >
            {busyRef === item.scene_reference ? '删除中…' : '删除'}
          </button>
        </div>
      ))}
    </div>
  )
}
