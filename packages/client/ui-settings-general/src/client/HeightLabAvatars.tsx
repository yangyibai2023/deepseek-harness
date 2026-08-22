/**
 * HeightLab avatar section (0.3.0 overlay): list the user's own digital-human
 * avatars, create a new one from a photo, and delete (archive). Backed by
 * heightlab-host-api routes (/hl/avatars, /hl/avatars/status, /hl/avatars/:ref)
 * which proxy to the gateway with the session token — no credential leaves
 * the host. Created avatars are immediately usable in chat (list_avatars).
 */
import { useEffect, useState } from 'react'

interface AvatarItem {
  avatar_reference: string
  name?: string | null
  status: string
  dispatchable?: boolean
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

const thumbStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 8,
  objectFit: 'cover',
  cursor: 'zoom-in',
  border: '1px solid rgba(127,127,127,0.25)',
  background: 'rgba(127,127,127,0.08)',
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
  cursor: 'zoom-out',
}

const largeImgStyle: React.CSSProperties = {
  maxWidth: '78vw',
  maxHeight: '78vh',
  borderRadius: 12,
  boxShadow: '0 16px 60px rgba(0,0,0,0.45)',
  background: '#fff',
}

const buttonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: '8px',
  border: '1px solid currentColor',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 13,
}

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#1f6feb',
  borderColor: '#1f6feb',
  color: '#fff',
  fontWeight: 600,
}

const dialogOverlayStyle: React.CSSProperties = {
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
    case 'training': return '创建中'
    case 'staged': return '待创建'
    case 'failed': return '创建失败'
    case 'archived': return '已删除'
    case 'revoked': return '已撤销'
    default: return status
  }
}

function shortRef(ref: string): string {
  return ref.length > 20 ? `${ref.slice(0, 10)}…${ref.slice(-6)}` : ref
}

function AvatarThumb({ item, onOpen }: { item: AvatarItem; onOpen: (item: AvatarItem) => void }) {
  const [failed, setFailed] = useState(false)
  if (item.preview_url && !failed) {
    return (
      <img
        src={item.preview_url}
        alt={item.name ?? '形象'}
        style={thumbStyle}
        onClick={() => onOpen(item)}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div
      style={{
        ...thumbStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        color: 'var(--dsw-alias-label-secondary)',
      }}
    >
      形象
    </div>
  )
}

export function HeightLabAvatars() {
  const [items, setItems] = useState<AvatarItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyRef, setBusyRef] = useState<string | null>(null)
  const [viewing, setViewing] = useState<AvatarItem | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createFile, setCreateFile] = useState<File | null>(null)
  const [createPreview, setCreatePreview] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const refresh = (): void => {
    fetch('/hl/avatars')
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setItems(Array.isArray(data.items) ? data.items : [])
          setError(null)
        } else {
          setItems([])
          setError(data?.message ?? '形象加载失败')
        }
      })
      .catch(() => { setItems([]); setError('形象加载失败，请稍后重试') })
  }

  useEffect(() => { refresh() }, [])

  // 有创建中的形象时每 8 秒自动刷新一次（后台 sweeper 会自动推进）。
  useEffect(() => {
    if (!items.some((item) => item.status === 'training')) return
    const timer = window.setInterval(refresh, 8_000)
    return () => window.clearInterval(timer)
  }, [items])

  const pickImage = (file: File | undefined): void => {
    setCreateError(null)
    if (!file || !file.type.startsWith('image/')) {
      setCreateError('请选择图片文件。')
      return
    }
    setCreateFile(file)
    const reader = new FileReader()
    reader.onload = () => setCreatePreview(String(reader.result))
    reader.readAsDataURL(file)
  }

  const create = async (): Promise<void> => {
    setCreateError(null)
    if (!createFile) {
      setCreateError('请先选择一张清晰正面照片。')
      return
    }
    if (!consent) {
      setCreateError('请先确认肖像权授权。')
      return
    }
    setCreating(true)
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const raw = String(reader.result ?? '')
          resolve(raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw)
        }
        reader.onerror = () => reject(new Error('read-failed'))
        reader.readAsDataURL(createFile)
      })
      const res = await fetch('/hl/avatars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          image_filename: createFile.name,
          name: createName.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean
        message?: string
        avatar_reference?: string
        operation_reference?: string
      }
      if (!res.ok || data?.ok !== true || !data.avatar_reference) {
        setCreateError(data?.message ?? '形象创建失败，请稍后重试。')
        return
      }
      // 轮询创建进度，完成后刷新列表并关闭弹窗
      const ref = data.avatar_reference
      const opRef = data.operation_reference
      for (let i = 0; i < 60; i += 1) {
        await new Promise((r) => window.setTimeout(r, 5_000))
        try {
          const sr = await fetch('/hl/avatars/status', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ avatar_reference: ref, operation_reference: opRef }),
          })
          const sdata = await sr.json().catch(() => ({})) as { ok?: boolean; status?: string }
          if (sdata?.status === 'ready' || sdata?.status === 'failed') break
        } catch {
          // 继续轮询
        }
      }
      refresh()
      setCreateOpen(false)
      setCreateFile(null)
      setCreatePreview(null)
      setCreateName('')
      setConsent(false)
    } catch {
      setCreateError('形象创建失败，请稍后重试。')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (ref: string): Promise<void> => {
    if (!window.confirm('确定删除该数字人形象吗？删除后不可恢复。')) return
    setBusyRef(ref)
    try {
      const r = await fetch(`/hl/avatars/${encodeURIComponent(ref)}`, { method: 'DELETE' })
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
          <div style={{ fontWeight: 600 }}>形象</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>我的数字人形象（新建后可直接在对话中使用）</div>
        </div>
        {/* HeightLab：新建形象用原生描边按钮，不用蓝色主按钮。 */}
        <button type="button" style={buttonStyle} onClick={() => { setCreateOpen(true); setCreateError(null) }}>
          新建形象
        </button>
      </div>
      {error && <div style={{ opacity: 0.8, fontSize: 13, color: '#d64545' }}>{error}</div>}
      {!error && items.length === 0 && (
        <div style={{ opacity: 0.6, fontSize: 13 }}>还没有数字人形象，点击「新建形象」上传一张清晰正面照即可创建。</div>
      )}
      {items.map((item) => (
        <div key={item.avatar_reference} style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <AvatarThumb item={item} onOpen={setViewing} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name ?? `形象 ${shortRef(item.avatar_reference)}`}
              </div>
              <div style={{ opacity: 0.7, fontSize: 12, fontFamily: 'monospace' }}>{shortRef(item.avatar_reference)}</div>
              <div style={{ opacity: 0.7, fontSize: 12 }}>{statusLabel(item.status)}</div>
            </div>
          </div>
          <button
            type="button"
            style={buttonStyle}
            disabled={busyRef === item.avatar_reference}
            onClick={() => { void remove(item.avatar_reference) }}
          >
            {busyRef === item.avatar_reference ? '删除中…' : '删除'}
          </button>
        </div>
      ))}
      {viewing && (
        <div style={overlayStyle} onClick={() => setViewing(null)}>
          <img
            src={viewing.preview_url ?? ''}
            alt={viewing.name ?? '形象预览'}
            style={largeImgStyle}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {createOpen && (
        <div style={dialogOverlayStyle} onClick={() => { if (!creating) setCreateOpen(false) }}>
          <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>新建数字人形象</div>
            <div style={{ opacity: 0.7, fontSize: 13 }}>
              上传一张清晰正面照，创建你自己的数字人形象。创建后可在对话中直接使用。
            </div>
            {createPreview ? (
              <img
                src={createPreview}
                alt="形象照片预览"
                style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 10, border: '1px solid rgba(127,127,127,0.25)' }}
              />
            ) : (
              <label
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: 96, borderRadius: 10, border: '1px dashed rgba(127,127,127,0.45)',
                  cursor: 'pointer', fontSize: 13, opacity: 0.85,
                }}
              >
                点击选择照片
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => pickImage(e.target.files?.[0])}
                />
              </label>
            )}
            {createPreview && (
              <label style={{ fontSize: 13, opacity: 0.85, cursor: 'pointer' }}>
                重新选择照片
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => pickImage(e.target.files?.[0])}
                />
              </label>
            )}
            <input
              type="text"
              value={createName}
              placeholder="形象名字（可选，例如：王相宜）"
              style={inputStyle}
              maxLength={30}
              onChange={(e) => setCreateName(e.target.value)}
            />
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>我确认使用本人照片创建数字人形象，并同意肖像权授权。</span>
            </label>
            {createError && <div style={{ color: '#d64545', fontSize: 13 }}>{createError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" style={buttonStyle} disabled={creating} onClick={() => setCreateOpen(false)}>
                取消
              </button>
              <button type="button" style={primaryButtonStyle} disabled={creating} onClick={() => { void create() }}>
                {creating ? '创建中…' : '开始创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
