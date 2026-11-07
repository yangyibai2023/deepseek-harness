/**
 * HeightLab：资料库页面（素材管理 / 知识库 双标签）。
 *
 * 由 HubPage 渲染（标题由外层 header 提供，右上角关闭钮已按用户要求删除）。
 * 页内左右切换两个标签：tab 行水平内距与外层 header 一致（clamp 24-48），
 * 内容区分栏（左侧 112px 分类 + 右侧素材网格）自带 8px 内距。
 * 后续「素材管理」接入 dsh-artifact-library、「知识库」接入 dsh-knowledge
 * 的官方预装隐藏能力。
 */

import { useState, type CSSProperties } from 'react'
import clsx from 'clsx'
import css from './ConversationRoot.module.css'
import { HeightLabKnowledgePanel } from './HeightLabKnowledgePanel.tsx'
import { HeightLabMaterialPanel } from './HeightLabMaterialPanel.tsx'

/* 2026-11-08 用户拍板：素材管理放左侧且为默认页（资产中心优先展示素材库，
 * 知识库退居第二标签）。顺序即视觉顺序，默认值必须同步改——只改顺序不改
 * 默认会出现「素材在最左但打开仍落知识库」。 */
const LIBRARY_TABS = ['素材管理', '知识库'] as const
type LibraryTab = typeof LIBRARY_TABS[number]

const bodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 13,
}

/** Render the resource library page (素材管理 / 知识库). */
export function HeightLabLibraryPage() {
  const [tab, setTab] = useState<LibraryTab>('素材管理')

  return (
    <div
      style={{
        width: '100%',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--dsw-alias-bg-base)',
      }}
    >
      <div className={css.libraryTabs} role="tablist" data-tauri-drag-region="deep">
        {LIBRARY_TABS.map(name => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={clsx(css.libraryTab, tab === name && css.libraryTabActive)}
            onClick={() => {
              setTab(name)
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div style={bodyStyle}>
        {tab === '素材管理' ? (
          <HeightLabMaterialPanel />
        ) : (
          <HeightLabKnowledgePanel />
        )}
      </div>
    </div>
  )
}
