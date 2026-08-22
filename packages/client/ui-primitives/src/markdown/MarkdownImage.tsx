/**
 * HeightLab：markdown 图片缩略 + 点击全屏预览 + 下载。
 *
 * 聊天里模型用 `![...](url)` 贴的图片原本渲染成原生大图，无法交互；
 * 这里统一渲染为缩略图，点击打开全屏遮罩（大图 + 下载/关闭）。
 */

import { useEffect, useState } from 'react'

const buttonStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.35)',
  background: 'rgba(255,255,255,0.16)',
  color: '#fff',
  borderRadius: 8,
  padding: '7px 16px',
  fontSize: 13,
  cursor: 'pointer',
}

export function MarkdownImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const download = async (): Promise<void> => {
    const name = decodeURIComponent(src.split('/').pop()?.split('?')[0] ?? 'image.png')
    try {
      const blob = await (await fetch(src)).blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000)
    } catch {
      const a = document.createElement('a')
      a.href = src
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
  }

  return (
    <>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={{
          display: 'block',
          maxWidth: '100%',
          maxHeight: 240,
          borderRadius: 10,
          objectFit: 'contain',
          cursor: 'zoom-in',
          background: '#000',
        }}
        onClick={() => setOpen(true)}
      />
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            boxSizing: 'border-box',
          }}
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={alt}
            style={{
              maxWidth: '92%',
              maxHeight: '86vh',
              objectFit: 'contain',
              borderRadius: 10,
            }}
            onClick={event => event.stopPropagation()}
          />
          <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10 }}>
            <button type="button" style={buttonStyle} onClick={event => { event.stopPropagation(); void download() }}>
              下载
            </button>
            <button type="button" style={buttonStyle} onClick={() => setOpen(false)}>
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  )
}
