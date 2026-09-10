// @vitest-environment jsdom
/**
 * 企业版 M6：「专属」模板栏数据层（2026-08-29）。
 * 覆盖：跨分类扁平化、品牌字段归一化（主题色防注入）、
 * loadTemplateCatalog 企业/个人模式下的 enterpriseDock 登记。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  flattenEnterpriseTemplates,
  getEnterpriseDock,
  loadTemplateCatalog,
  normalizeEnterpriseBranding,
  normalizeThemeColor,
} from '../src/client/skeleton/HeightLabTemplates'

function stubCatalogFetch(payload: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => payload,
  })))
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('flattenEnterpriseTemplates（专属栏扁平化）', () => {
  it('跨分类扁平化并保留原分类角标', () => {
    const out = flattenEnterpriseTemplates({
      文案: [{ title: '企业公文', desc: '红头文件', prompt: 'x' }],
      图片: [{ title: '企业海报' }],
      自定义类: [{ title: '非标卡' }],
    })
    expect(out.map(i => [i.title, i.sourceCategory])).toEqual([
      ['企业公文', '文案'],
      ['企业海报', '图片'],
      ['非标卡', '自定义类'],
    ])
    // 缺省字段补齐，渲染不依赖通用集
    expect(out[1]!.color).toBe('#E8ECFF')
    expect(out[1]!.desc).toBe('')
    expect(out[0]!.prompt).toBe('x')
  })

  it('无标题/非数组条目被过滤', () => {
    const out = flattenEnterpriseTemplates({
      文案: [{ title: '' }, { desc: '无标题' } as never, { title: '有效' }],
      坏类: 'not-array' as never,
    })
    expect(out).toHaveLength(1)
    expect(out[0]!.title).toBe('有效')
  })
})

describe('normalizeThemeColor / normalizeEnterpriseBranding（品牌字段）', () => {
  it('主题色只接受 #RRGGBB', () => {
    expect(normalizeThemeColor('#3551C4')).toBe('#3551C4')
    expect(normalizeThemeColor('#abc')).toBeNull()
    expect(normalizeThemeColor('red')).toBeNull()
    // CSS 注入尝试一律拒绝
    expect(normalizeThemeColor('#fff;position:fixed')).toBeNull()
    expect(normalizeThemeColor('expression(1)')).toBeNull()
    expect(normalizeThemeColor(123)).toBeNull()
  })

  it('品牌对象归一化：非对象/空串字段处理', () => {
    expect(normalizeEnterpriseBranding(null)).toBeNull()
    expect(normalizeEnterpriseBranding('x')).toBeNull()
    expect(normalizeEnterpriseBranding({
      brandName: '甲方科技', logoUrl: 'https://cdn/x.png', slogan: '', themeColor: '#111111',
    })).toEqual({ brandName: '甲方科技', logoUrl: 'https://cdn/x.png', slogan: null, themeColor: '#111111' })
  })
})

describe('loadTemplateCatalog（enterpriseDock 登记）', () => {
  const base = {
    ok: true,
    templates: { 推荐: [{ title: '通用卡', desc: 'g', color: '#FFF1C9' }] },
  }

  it('企业模式：专属条目 + 品牌登记，企业模板并入通用分类', async () => {
    window.localStorage.setItem('hl.mode', 'enterprise')
    window.localStorage.setItem('hl.mode.orgId', 'org-t')
    stubCatalogFetch({
      ...base,
      enterprise: {
        'org-t': {
          templates: { 文案: [{ title: '企业公文', desc: 'd' }] },
          branding: { brandName: '甲方科技', logoUrl: null, slogan: null, themeColor: '#3551C4' },
        },
      },
    })
    const catalog = await loadTemplateCatalog()
    expect(catalog).not.toBeNull()
    // 企业模板追加到对应分类尾部，通用集保留
    expect(catalog!.文案.some(i => i.title === '企业公文')).toBe(true)
    expect(catalog!.推荐.some(i => i.title === '通用卡')).toBe(true)
    const dock = getEnterpriseDock()
    expect(dock?.orgId).toBe('org-t')
    expect(dock?.exclusive.map(i => i.title)).toEqual(['企业公文'])
    expect(dock?.branding?.brandName).toBe('甲方科技')
    expect(dock?.branding?.themeColor).toBe('#3551C4')
  })

  it('企业模式但无本企业段：专属空态，不泄露存在性', async () => {
    window.localStorage.setItem('hl.mode', 'enterprise')
    window.localStorage.setItem('hl.mode.orgId', 'org-none')
    stubCatalogFetch(base)
    await loadTemplateCatalog()
    const dock = getEnterpriseDock()
    expect(dock).not.toBeNull()
    expect(dock?.exclusive).toEqual([])
    expect(dock?.branding).toBeNull()
  })

  it('个人模式：enterpriseDock 为空', async () => {
    window.localStorage.setItem('hl.mode', 'personal')
    stubCatalogFetch(base)
    await loadTemplateCatalog()
    expect(getEnterpriseDock()).toBeNull()
  })
})
