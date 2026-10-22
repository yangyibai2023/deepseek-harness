/**
 * HeightLab combined "声音与形象" settings section (0.3.0 overlay):
 * one menu entry, two grouped parts:
 *  - 视频生成：人物资产（含关键帧/补充照片）+ 场景；
 *  - 数字人：数字人形象 + 克隆声音。
 * All support create / list / delete and are immediately usable.
 */
import { HeightLabAvatars } from './HeightLabAvatars.tsx'
import { HeightLabVoices } from './HeightLabVoices.tsx'
import { HeightLabCharacters } from './HeightLabCharacters.tsx'
import { HeightLabScenes } from './HeightLabScenes.tsx'

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid rgba(127,127,127,0.18)',
  margin: '2px 16px',
}

const noticeStyle: React.CSSProperties = {
  margin: '0 16px 8px',
  fontSize: 12.5,
  lineHeight: 1.7,
  opacity: 0.62,
}

const codeStyle: React.CSSProperties = {
  padding: '0 4px',
  borderRadius: 4,
  background: 'rgba(127,127,127,0.16)',
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
}

const groupHeaderStyle: React.CSSProperties = {
  padding: '14px 16px 2px',
  fontSize: 12,
  fontWeight: 600,
  opacity: 0.55,
  letterSpacing: 0.5,
}

export function HeightLabVoiceAvatar() {
  return (
    <div style={containerStyle}>
      <div style={groupHeaderStyle}>视频生成</div>
      <HeightLabCharacters />
      <div style={dividerStyle} />
      <HeightLabScenes />
      {/* HeightLab（2026-10-22）：数字人能力暂时下线，形象/声音不再需要手动
          创建。这里保留历史资产（只读、仍可删除），并说明新的获得方式——
          在对话里生成的内容会自动沉淀到这里，输入框 `@` 可直接调用。
          新建入口在各自的组件里由 SHOW_MANUAL_CREATE 关闭。 */}
      <div style={groupHeaderStyle}>数字人（能力暂时下线，历史资产保留）</div>
      <p style={noticeStyle}>
        形象与声音现在由对话自动沉淀：在聊天里生成的形象、克隆的声音会出现在这里，
        输入框输入 <code style={codeStyle}>@</code> 可直接调用。
      </p>
      <HeightLabAvatars />
      <div style={dividerStyle} />
      <HeightLabVoices />
    </div>
  )
}
