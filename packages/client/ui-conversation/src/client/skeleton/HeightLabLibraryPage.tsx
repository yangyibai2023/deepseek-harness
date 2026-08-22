/**
 * HeightLab：资料库页面（素材管理 / 知识库 双标签）。
 *
 * 由创意灵感同类覆盖层进入（标题与右上角「×」由外层 HubPage 提供）；
 * 页内左右切换两个标签。
 * 后续「素材管理」接入 dsh-artifact-library、「知识库」接入 dsh-knowledge
 * 的官方预装隐藏能力。
 */

import { useState, type CSSProperties } from 'react'
import clsx from 'clsx'
import css from './ConversationRoot.module.css'
import { HeightLabKnowledgePanel } from './HeightLabKnowledgePanel.tsx'
import { HeightLabMaterialPanel } from './HeightLabMaterialPanel.tsx'

const LIBRARY_TABS = ['知识库', '素材管理'] as const
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
  const [tab, setTab] = useState<LibraryTab>('知识库')

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
