// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComponentProps } from 'react'
import type { ModelDirectoryState } from '../src/client/directory.ts'
import { ModelSelect } from '../src/client/ModelSelect.tsx'
import { zh } from '../src/client/locales.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

// The seat's key domain is model ∪ common; the stub mirrors the real lookup
// chain: package dictionary, then common vocabulary, then the key.
const t: ComponentProps<typeof ModelSelect>['t'] = (key, params) => {
  const template = (zh as Record<string, string>)[key]
    ?? (commonZh as Record<string, string>)[key]
    ?? key
  return params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

const reasoning = {
  efforts: [
    { id: 'off', name: 'Off' },
    { id: 'high', name: 'High' },
    { id: 'max', name: 'Max', description: 'Largest budget' },
  ],
  defaultEffort: 'high',
}

function state(overrides: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    routable: true,
    groups: [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{
        id: 'deepseek-v4-flash',
        name: 'DeepSeek-V4-Flash',
        description: 'Fast catalog description',
        reasoning,
      }],
    }],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
    ...overrides,
  }
}


afterEach(cleanup)


/* ══════════════════════════════════════════════════════════════════════
 * 2026-10-22 重写（用户拍板·照 ZCode 截图）。
 *
 * 组件形态整体改了：
 *   旧：一个按钮 → 菜单里「模型/推理等级」两行 → 各自 drill 进二级列表
 *   新：一个按钮 → 供应商列表 → 进入某供应商 → 型号列表 + 思考强度滑块
 *
 * 旧测试断言的是上游那套两级菜单的内部实现（pane 状态、搜索框、
 * 键盘 walk 顺序、menuitemradio 角色），形态一换就全部失效 —— 51/52 失败。
 * 继续按旧断言改只会写出「为了变绿而绿」的测试，所以整段重写为验证
 * 新形态真正承诺的行为：
 *   ① 单触发，按钮 aria 只有模型名
 *   ② 根层是供应商列表（不再有「模式」「模型」「推理等级」三行入口）
 *   ③ 进入供应商后原地换成型号列表（没有侧边子菜单）
 *   ④ 型号可选中并提交正确的 ModelSelection
 *   ⑤ 思考强度用滑块（role=slider），可拖动/方向键改变并提交
 *   ⑥ 返回按钮回到根层
 *   ⑦ 加载中/空目录有文案
 *   ⑧ 提交失败弹 Toast
 * ══════════════════════════════════════════════════════════════════════ */

/** 渲染一个已注入目录的 ModelSelect。 */
function mount(overrides: Partial<ModelDirectoryState> = {}, select = vi.fn().mockResolvedValue({ ok: true, value: undefined })) {
  const directory = createSnapshotStore(state(overrides))
  render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={select} t={t} />)
  return { select, directory }
}

/** 打开面板并进入第一个供应商。 */
function openProvider(): void {
  fireEvent.click(screen.getByRole('button', { name: /选择模型|选择模型，当前/ }))
  const provider = screen.getByRole('menuitem', { name: /DeepSeek/ })
  fireEvent.click(provider)
}

describe('ModelSelect 单触发与根层', () => {
  it('renders one trigger whose aria names only the model', () => {
    mount()
    const trigger = screen.getByRole('button', { name: '选择模型，当前 DeepSeek-V4-Flash' })
    expect(trigger).toBeTruthy()
    // 不再有独立的思考程度按钮（档位在面板内的滑块里）
    expect(screen.queryByRole('button', { name: /思考程度，当前/ })).toBeNull()
  })

  it('opens to a provider list, not the old three-row entry menu', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    expect(screen.getByRole('menu')).toBeTruthy()
    // 根层直接是供应商（DeepSeek 出现在菜单里）
    expect(screen.getByRole('menuitem', { name: /DeepSeek/ })).toBeTruthy()
    // 旧入口行已不存在
    expect(screen.queryByRole('menuitem', { name: /^模式/ })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /^推理等级/ })).toBeNull()
  })

  it('marks the provider holding the current model', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    const row = screen.getByRole('menuitem', { name: /DeepSeek/ })
    // 当前型号属于该供应商 → 行内有勾选图标（svg），而非右箭头
    expect(row.querySelector('svg')).not.toBeNull()
  })

  it('keeps showing the previous providers while a refresh loads', () => {
    /* 刷新中仍展示上一次的目录 —— 这是刻意的：把列表换成「正在加载」
     * 会让用户手里的菜单突然清空（闪一下再回来）。只有真正空目录才显示提示。 */
    mount({ status: 'loading' })
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    expect(screen.getByRole('menuitem', { name: /DeepSeek/ })).toBeTruthy()
  })

  it('shows the loading label when there is nothing to show yet', () => {
    mount({ status: 'loading', groups: [] })
    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    expect(screen.getByRole('menu').textContent).toContain(t('status.loading'))
  })
})

describe('ModelSelect drill-down', () => {
  it('replaces the list in place instead of opening a side submenu', () => {
    mount()
    openProvider()
    // 型号列表出现
    expect(screen.getByRole('menuitem', { name: /DeepSeek-V4-Flash/ })).toBeTruthy()
    // 没有任何侧边子菜单卡片
    expect(document.querySelector('[class*="submenuPortal"]')).toBeNull()
  })

  it('goes back to the provider list from the drill header', () => {
    mount()
    openProvider()
    // 返回按钮：drill 头部的 button（不是 menuitem）
    const back = screen.getByRole('button', { name: /返回供应商/ })
    fireEvent.click(back)
    expect(screen.getByRole('menuitem', { name: /DeepSeek/ })).toBeTruthy()
  })

  it('submits the full selection when a model row is picked', async () => {
    const { select } = mount()
    openProvider()
    fireEvent.click(screen.getByRole('menuitem', { name: /DeepSeek-V4-Flash/ }))
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
        reasoningEffort: 'high',
      })
    })
  })
})

describe('ModelSelect 思考强度滑块', () => {
  it('renders a slider with the effort levels as its value range', () => {
    mount()
    openProvider()
    const slider = screen.getByRole('slider')
    expect(slider.getAttribute('aria-label')).toBe(t('menu.effort') === '推理等级' ? '思考强度' : t('menu.effort'))
    expect(slider.getAttribute('aria-valuetext')).toBe('High')
    expect(slider.getAttribute('aria-valuemax')).toBe('2')  // Off / High / Max
  })

  it('arrow keys move the effort and submit it', async () => {
    const { select } = mount()
    openProvider()
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: 'max' }))
    })
  })

  it('Home jumps to the first level', async () => {
    const { select } = mount()
    openProvider()
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: 'off' }))
    })
  })
})

describe('ModelSelect 失败与表面', () => {
  it('announces a rejected selection through a toast', async () => {
    const select = vi.fn().mockResolvedValue({ ok: false, error: new RemoteError('session/model-unavailable', 'nope', { provider: 'deepseek-official', model: 'deepseek-v4-flash' }) })
    mount({}, select)
    openProvider()
    fireEvent.click(screen.getByRole('menuitem', { name: /DeepSeek-V4-Flash/ }))
    await waitFor(() => { expect(screen.getByRole('alert')).toBeTruthy() })
  })

  it('hides the whole seat when unavailable', () => {
    const directory = createSnapshotStore(state())
    const { container } = render(
      <ModelSelect locked={false} available={false} directory={directory} load={vi.fn()} select={vi.fn()} t={t} />,
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('keeps the menu open while a selection settles', async () => {
    let resolve: (value: unknown) => void = () => {}
    const select = vi.fn().mockReturnValue(new Promise((r) => { resolve = r }))
    mount({}, select)
    openProvider()
    fireEvent.click(screen.getByRole('menuitem', { name: /DeepSeek-V4-Flash/ }))
    // 未 settle 前菜单仍在
    expect(screen.getByRole('menu')).toBeTruthy()
    await act(async () => { resolve({ ok: true, value: undefined }) })
  })
})
