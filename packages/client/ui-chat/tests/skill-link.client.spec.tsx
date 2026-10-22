// @vitest-environment jsdom
/**
 * 回复里 `#hl-skills` 锚点的直达行为（2026-10-22）。
 *
 * 模型沉淀完技能后，回复末尾会带 `[打开我的技能](#hl-skills)`。点它必须：
 *   1. 不发真实导航（锚点被 preventDefault）；
 *   2. 打开技能中心覆盖层；
 *   3. 落在「我的技能」标签 —— 包括 Hub **尚未挂载** 的时序（此时事件会丢，
 *      只能靠 pending 标记传递）。
 *
 * 第 3 点是实测踩到的：只派发 hl:open-skill 事件时，Hub 挂载后监听器才注册，
 * 事件已经过去，界面停在「官方精选」，用户以为链接没生效。
 */
import { cleanup, render, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantMarkdown } from '../src/client/chat/AssistantMarkdown.tsx'
import { useDetailedPresentation } from './presentation-fixture.client.ts'
import { useDisclosure } from '../src/client/chat/use-disclosure.ts'
import { useSearchableHidden } from '../src/client/chat/searchable-hidden.ts'
import type { ChatNodeOwnerProps, ChatViewSlotProps } from '../src/client/contract/slots.ts'
import type { AssistantBlock } from '../src/client/contract/snapshot.ts'

const t = ((_key: string) => 'label') as ChatViewSlotProps['t']
const renderMessageImages = (() => null) as ChatNodeOwnerProps['renderMessageImages']

function textBlock(text: string): AssistantBlock {
  return { kind: 'text', text }
}

function mount(text: string) {
  return render(
    <AssistantMarkdown
      renderSlot={() => null}
      useDisclosure={useDisclosure}
      useGroupAction={useSearchableHidden}
      usePresentation={useDetailedPresentation}
      blocks={[textBlock(text)]}
      streaming={false}
      renderMessageImages={renderMessageImages}
      t={t}
    />,
  )
}

beforeEach(() => {
  delete (window as unknown as { __hlPendingHub?: string }).__hlPendingHub
  delete (window as unknown as { __hlPendingSkillTab?: string }).__hlPendingSkillTab
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('#hl-skills 直达链接', () => {
  /* 链接写成同源绝对 URL（`http://host/#hl-skills`），不是纯锚点：
   * markdown 的 URL 白名单只放行 http/https/mailto，纯 `#…` 会被判成相对
   * URL 后整条链接被剥掉（实测模型写了链接、界面上只剩文字）。 */
  const ABS = 'http://127.0.0.1:3080/#hl-skills'

  it('renders the absolute-url link instead of dropping it', () => {
    const { container } = mount(`已保存。[打开我的技能](${ABS})`)
    const link = container.querySelector('a[href]')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe(ABS)
    expect(link?.textContent).toBe('打开我的技能')
  })

  it('clicking it opens the skill hub and targets the mine tab', () => {
    const { container } = mount(`[打开我的技能](${ABS})`)
    const link = container.querySelector('a[href]')!
    const openHub = vi.fn()
    const openSkill = vi.fn()
    window.addEventListener('hl:open-hub', openHub)
    window.addEventListener('hl:open-skill', openSkill)
    fireEvent.click(link)
    expect(openHub).toHaveBeenCalledTimes(1)
    expect(openSkill).toHaveBeenCalledTimes(1)
    // pending 标记是 Hub 未挂载时的唯一可靠通道。
    expect((window as unknown as { __hlPendingHub?: string }).__hlPendingHub).toBe('skill-hub')
    expect((window as unknown as { __hlPendingSkillTab?: string }).__hlPendingSkillTab).toBe('mine')
    window.removeEventListener('hl:open-hub', openHub)
    window.removeEventListener('hl:open-skill', openSkill)
  })

  it('does not intercept unrelated anchors', () => {
    const { container } = mount('[别处](https://example.com/x)')
    const link = container.querySelector('a')!
    const openHub = vi.fn()
    window.addEventListener('hl:open-hub', openHub)
    fireEvent.click(link)
    expect(openHub).not.toHaveBeenCalled()
    expect((window as unknown as { __hlPendingSkillTab?: string }).__hlPendingSkillTab).toBeUndefined()
    window.removeEventListener('hl:open-hub', openHub)
  })
})
