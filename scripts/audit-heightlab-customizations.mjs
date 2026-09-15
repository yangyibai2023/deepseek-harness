#!/usr/bin/env node
/**
 * HeightLab 定制清单审计 —— 防止"升级/迁移丢定制"的机制化检查。
 *
 * 背景（2026-09-16 立，用户定性为最大问题）：0.1.5 迁移反复丢我们的
 * 稳定线定制（35 个 CSS 类、.sideAction 基础规则、hero overflow+30vh、
 * stats.* locale 键、hl_boot 语义、StatsPills 产品设定…），因为定制
 * 只散落在代码注释里，没有机制在"每次升级/迁移后"盘点比对。
 *
 * 原理：我们所有定制在稳定线代码里都带 `HeightLab` 注释标记。
 * 本脚本统计：稳定基线 tag 中每个 client 包文件的标记数 vs 当前树，
 * 输出"标记减少"的文件清单 —— 每一项都必须人工判定：
 *   A) 定制还在（搬家/重构）→ 记录新位置
 *   B) 定制丢失 → 恢复
 *   C) 定制有意移除 → 在本文件 DELETED_CUSTOMIZATIONS 登记裁决
 *
 * 用法：node scripts/audit-heightlab-customizations.mjs [stable-tag]
 * 退出码：发现未裁决的差异即非零（可挂 CI / 迁移验收清单）。
 */
import { execSync } from 'node:child_process'
import process from 'node:process'

const TAG = process.argv[2] || 'heightlab-0.3.30-dsh-0.1.1-rc.2'

/** 有意移除的定制裁决（文件 → 理由）。审计遇这些文件的减少视为通过。 */
const DELETED_CUSTOMIZATIONS = new Map([
  // [file, reason]  —— 以下均为 2026-09-16 逐项人工裁决过的"搬家/有意移除"
  ['packages/client/ui-chat/src/client/apply.ts',
    'StatsPills 不注册是产品设定（0.3.17 起输入区无指标行，指标入圆环）'],
  ['packages/client/ui-conversation/src/client/skeleton/InputBar.tsx',
    '标记搬家：模板胶囊/hub/做同款在 input/hub.ts、HeightLabTemplates.ts、claim-decor.ts、AgentPresetSeat.tsx；发送按钮 27.2px 在 InputBar.module.css'],
  ['packages/client/ui-settings-general/src/client/index.ts',
    '标记搬家：账户/余额在 HeightLabAccount.tsx、关于在 HeightLabAbout.tsx、形象与声音在 SettingsRoot.tsx'],
  ['packages/client/ui-workspace/src/client/index.ts',
    '措辞变化：自动开会话与登录守卫定制仍在（index.ts 83/101 行）'],
  ['packages/client/ui-conversation/tests/chat-apply.client.spec.tsx',
    '测试随 0.1.5 拆包迁移（composer.dock 空断言已在 ui-chat 侧）'],
  ['packages/client/ui-conversation/tests/chat-view.client.spec.tsx',
    '测试随 0.1.5 拆包迁移'],
  ['packages/client/ui-conversation/tests/chat-branch-tails.client.spec.tsx',
    '测试随 0.1.5 拆包迁移'],
  ['packages/client/ui-conversation/tests/image-labels.client.spec.tsx',
    '测试随 0.1.5 拆包迁移'],
])

const files = execSync(`git grep -l HeightLab ${TAG} -- packages/client`, {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
}).split('\n').map(l => l.split(':', 1)[0] && l.replace(`${TAG}:`, '')).filter(Boolean)

// 0.1.5 拆包映射：stable ui-conversation/chat → ui-chat
function candidates(rel) {
  return [rel,
    rel.replace('/ui-conversation/src/client/chat/', '/ui-chat/src/client/chat/'),
    rel.replace('packages/client/ui-conversation/src/client/', 'packages/client/ui-chat/src/client/')]
}

const problems = []
for (const rel of files) {
  const stable = execSync(`git show ${TAG}:${rel}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('HeightLab').length - 1
  let cur = -2, curPath = null
  for (const c of candidates(rel)) {
    try {
      const { readFileSync } = await import('node:fs')
      cur = readFileSync(c, 'utf8').split('HeightLab').length - 1
      curPath = c
      break
    } catch { /* try next */ }
  }
  if (cur === -2) { problems.push([rel, stable, 'MISSING', '']); continue }
  if (stable - cur >= 3 && !DELETED_CUSTOMIZATIONS.has(curPath ?? rel)) {
    problems.push([rel, stable, cur, curPath ?? ''])
  }
}

console.log(`stable-tag=${TAG}`)
if (problems.length === 0) {
  console.log('AUDIT_OK：无未裁决的定制标记减少')
  process.exit(0)
}
console.log(`AUDIT_DIFF：${problems.length} 个文件的定制标记减少，逐项裁决：`)
for (const [rel, a, b, cp] of problems) {
  console.log(`  ${a}\t${b}\t${rel}  (now: ${cp})`)
}
process.exit(1)
