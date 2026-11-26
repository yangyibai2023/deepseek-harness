/**
 * One opened JSON unit in `single` layout: the whole unit is one document at
 * `<root>/<name>.json`. The in-memory state is authoritative; every write
 * primitive mutates it and republishes the whole file atomically. Writes are
 * NOT queued here — per the backend contract, write ordering belongs to the
 * caller (the domain layer's write chain); this unit only guarantees that
 * each single call publishes a complete, durable file. The `per-record`
 * layout is a separate unit class in `per-record-unit.ts`.
 * @module @deepseek-ai/dsh-storage-json/src/single-unit
 */

import { copyFile, readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { StorageError } from '@deepseek-ai/dsh-storage'
import type { KvUnit, KvUnitDescriptor } from '@deepseek-ai/dsh-storage'
import { writeAtomic } from './atomic.ts'
import { parse, serialize } from './format.ts'
import type { UnitState } from './format.ts'

/**
 * Open (load or lazily create) one `single`-layout unit under `root`: the
 * unit file is `<root>/<name>.json`.
 * @param descriptor - Static identity and shape of the unit.
 * @param root - Absolute backend root directory.
 * @param onClose - Backend callback releasing the unit's open-slot.
 * @returns the opened unit.
 */
export async function openSingleUnit(
  descriptor: KvUnitDescriptor,
  root: string,
  onClose: () => void,
): Promise<KvUnit> {
  const path = join(root, `${descriptor.name}.json`)
  let text: string | undefined
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    // Missing file = empty unit; materialization defers to the first write.
  }
  const emptyState = (): UnitState => ({
    version: descriptor.version,
    global: null,
    tables: new Map(descriptor.tables.map(table => [table, new Map<string, unknown>()])),
  })
  let state: UnitState
  if (text === undefined) {
    state = emptyState()
  } else {
    try {
      state = parse(text, descriptor)
    } catch (error) {
      /* HeightLab 2026-11-27（O101）：声明 backup-and-skip 的 unit，整份文档
       * 损坏（非法 JSON / 非对象 / 表非对象）时把坏文件改名 `.bak.<stamp>`
       * 后按空 unit 打开，而不是让整个域打不开（workspace.json 坏一条 →
       * 7 服务 pending → 全站不可用的 P0 链路在此斩断）。
       * `version-mismatch` 与异主 header 不在降级范围：数据属于别的格式
       * 时代，静默挪走等于替用户丢数据，保持硬抛。 */
      const isCorrupt = error instanceof StorageError && error.code === 'malformed-medium'
      if (!isCorrupt || descriptor.invalidRecords !== 'backup-and-skip') throw error
      await rename(path, `${path}.bak.${backupStamp(new Date())}`)
      state = emptyState()
    }
  }
  return new SingleJsonUnit(descriptor, path, state, onClose)
}

class SingleJsonUnit implements KvUnit {
  private closed = false
  /** In-flight publishes; close() drains them before releasing the unit. */
  private readonly inFlight = new Set<Promise<unknown>>()

  constructor(
    private readonly descriptor: KvUnitDescriptor,
    private readonly path: string,
    private readonly state: UnitState,
    private readonly onClose: () => void,
  ) {}

  // oxlint-disable-next-line typescript/require-await -- async keeps the closed guard a rejection, not a synchronous throw
  async loadAll(): Promise<{ tables: Record<string, Record<string, unknown>>; global: unknown }> {
    this.assertOpen()
    const tables: Record<string, Record<string, unknown>> = {}
    for (const [table, records] of this.state.tables) {
      tables[table] = Object.fromEntries(records)
    }
    return { tables, global: this.state.global }
  }

  async putRecord(table: string, key: string, value: unknown): Promise<void> {
    this.assertOpen()
    const records = this.records(table)
    const hadKey = records.has(key)
    const previous = records.get(key)
    records.set(key, value)
    // Roll back on a failed publish: memory is authoritative, so a rejected
    // write must not survive in memory (or ride along with the next publish).
    await this.publish().catch((error: unknown) => {
      if (hadKey) records.set(key, previous)
      else records.delete(key)
      throw error
    })
  }

  async deleteRecord(table: string, key: string): Promise<void> {
    this.assertOpen()
    const records = this.records(table)
    if (!records.has(key)) return
    const previous = records.get(key)
    records.delete(key)
    await this.publish().catch((error: unknown) => {
      records.set(key, previous)
      throw error
    })
  }

  async setGlobal(value: unknown): Promise<void> {
    this.assertOpen()
    if (!this.descriptor.hasGlobal) {
      throw new Error(`unit '${this.descriptor.name}' does not declare a global slot`)
    }
    const previous = this.state.global
    this.state.global = value
    await this.publish().catch((error: unknown) => {
      this.state.global = previous
      throw error
    })
  }

  /* HeightLab 2026-11-27（O101）：single 布局的 backupRecord——域层逐条
   * schema 校验失败时调用。与 per-record 布局「rename 单条文档」等价：
   * 先把当前整份文件复制为 `.bak.<stamp>`（案发完整快照，含坏记录，诊断
   * 价值高于只留坏条），再从内存态摘除坏条并原子重发布主文件。
   * `table === ''` 是 global 槽哨兵：坏 global 随快照进 bak，内存置 null，
   * 域层随后以 spec.initial 继续。 */
  async backupRecord(table: string, key: string): Promise<string> {
    this.assertOpen()
    const moved = `${this.path}.bak.${backupStamp(new Date())}`
    await this.tracked(copyFile(this.path, moved))
    if (table === '') {
      this.state.global = null
    } else {
      this.records(table).delete(key)
    }
    await this.publish()
    return moved
  }

  /* jscpd:ignore-start -- the two unit classes are standalone; the drain/guard lifecycle mirrors the shared KvUnit contract */
  async close(): Promise<void> {
    if (this.closed) {
      await Promise.allSettled(this.inFlight)
      return
    }
    this.closed = true
    await Promise.allSettled(this.inFlight)
    this.onClose()
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new StorageError('closed', `unit '${this.descriptor.name}' is closed`)
    }
  }
  /* jscpd:ignore-end */

  private records(table: string): Map<string, unknown> {
    const records = this.state.tables.get(table)
    if (!records) {
      throw new Error(`unit '${this.descriptor.name}' does not declare table '${table}'`)
    }
    return records
  }

  private publish(): Promise<void> {
    return this.tracked(writeAtomic(this.path, serialize(this.descriptor.name, this.state)))
  }

  private tracked<T>(op: Promise<T>): Promise<T> {
    this.inFlight.add(op)
    // Swallow only on the tracking branch: the caller still awaits `op`
    // itself, so rejections stay observed exactly once.
    op.catch(() => {}).finally(() => this.inFlight.delete(op))
    return op
  }
}

/** Local-time `YYYYMMDDHHmm` suffix for backed-up documents (mirrors per-record-unit). */
function backupStamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${String(now.getFullYear())}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`
}
