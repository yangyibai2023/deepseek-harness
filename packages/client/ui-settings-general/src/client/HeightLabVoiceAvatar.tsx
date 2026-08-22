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
      <div style={groupHeaderStyle}>数字人</div>
      <HeightLabAvatars />
      <div style={dividerStyle} />
      <HeightLabVoices />
    </div>
  )
}
