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
import { HeightLabFeedback } from './HeightLabFeedback.tsx'

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
  /* 2026-10-19 上线审计 P0-4：剪辑台导出依赖的 chromium-headless-shell
   * 在干净机器上可能缺失。旧文案让用户来「关于」点一个根本不存在的按钮；
   * 这里补上真实入口（状态查询 + 一键安装，后端 /hl/film/render-browser）。 */
  const [renderBrowser, setRenderBrowser] = useState<{ ready: boolean; installing: boolean } | null>(null)
  const [renderBrowserNote, setRenderBrowserNote] = useState('')

  const refreshRenderBrowser = (): void => {
    fetch('/hl/film/render-browser')
      .then(r => r.json())
      .then((data: { ok?: boolean; ready?: boolean; installing?: boolean }) => {
        if (data?.ok) setRenderBrowser({ ready: data.ready === true, installing: data.installing === true })
      })
      .catch(() => { /* 非桌面环境或剪辑台未加载：不显示 */ })
  }

  const installRenderBrowser = async (): Promise<void> => {
    setRenderBrowserNote('正在下载（约 93MB），保持网络畅通…')
    try {
      const res = await fetch('/hl/film/render-browser', { method: 'POST' })
      const data = await res.json() as { ok?: boolean; ready?: boolean; installing?: boolean; message?: string }
      if (data?.ok !== true) {
        setRenderBrowserNote(data?.message ?? '安装失败，请稍后重试。')
        return
      }
      setRenderBrowser({ ready: data.ready === true, installing: data.installing === true })
      if (data.ready === true) {
        setRenderBrowserNote('渲染组件已就绪。')
        return
      }
      // 下载在后台进行：每 3 秒轮询一次，最多 5 分钟。
      let tries = 0
      const timer = window.setInterval(() => {
        tries += 1
        fetch('/hl/film/render-browser')
          .then(r => r.json())
          .then((next: { ok?: boolean; ready?: boolean; installing?: boolean }) => {
            if (next?.ok) setRenderBrowser({ ready: next.ready === true, installing: next.installing === true })
            if (next?.ready === true) {
              window.clearInterval(timer)
              setRenderBrowserNote('渲染组件已就绪，可以导出成片了。')
            } else if (next?.installing !== true) {
              window.clearInterval(timer)
              setRenderBrowserNote('下载已结束但未检测到组件，请重试或检查网络。')
            }
          })
          .catch(() => { /* 下一轮再试 */ })
        if (tries >= 100) {
          window.clearInterval(timer)
          setRenderBrowserNote('下载仍在进行，稍后回到此页查看状态即可。')
        }
      }, 3000)
    } catch {
      setRenderBrowserNote('安装请求失败，请稍后重试。')
    }
  }

  useEffect(() => {
    fetch('/hl/app-info')
      .then(r => r.json())
      .then((data) => { if (data?.ok) setInfo(data) })
      .catch(() => { /* 保持默认 */ })
    refreshRenderBrowser()
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

      {/* 剪辑台导出所需的渲染浏览器（干净机器可能缺失）。 */}
      {renderBrowser !== null && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>视频导出组件</div>
          <div style={{ fontSize: 12, opacity: 0.75, lineHeight: '18px' }}>
            {renderBrowser.ready
              ? '已就绪：剪辑台可以导出成片。'
              : '未安装：剪辑台可以编辑与预览，但「导出成片」需要先安装渲染组件（约 93MB，只需一次）。'}
          </div>
          {!renderBrowser.ready && (
            <div style={rowStyle}>
              <button
                type="button"
                style={buttonStyle}
                disabled={renderBrowser.installing}
                onClick={() => { void installRenderBrowser() }}
              >
                {renderBrowser.installing ? '安装中…' : '安装渲染组件'}
              </button>
            </div>
          )}
          {renderBrowserNote !== '' && <div style={{ fontSize: 12, opacity: 0.7 }}>{renderBrowserNote}</div>}
        </div>
      )}

      {/* HeightLab P1：问题反馈（匿名可提交，云端反馈队列） */}
      <HeightLabFeedback />
    </div>
  )
}
