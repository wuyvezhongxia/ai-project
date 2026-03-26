import type { CSSProperties } from 'react'

const avatarPalette = ['#5b8ff9', '#36cfc9', '#f6bd16', '#7262fd', '#ff7d4a', '#2fc25b']

const neutralAvatarStyle: CSSProperties = {
  color: '#eef3ff',
  background: 'rgba(89, 102, 142, 0.34)',
  border: '1px solid rgba(128, 145, 196, 0.2)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
}

const hashString = (value: string) =>
  Array.from(value).reduce((acc, char) => acc * 31 + char.charCodeAt(0), 7)

export const getAvatarLabel = (value?: string | null) => {
  const normalized = value?.trim() || '未'
  return normalized.slice(-1)
}

export const getAvatarSeed = (...values: Array<string | null | undefined>) => {
  const stableValue = values.find((item) => item?.trim())
  return stableValue?.trim() || 'default-avatar'
}

export const getAvatarStyle = (seed?: string | null): CSSProperties => {
  const paletteColor = avatarPalette[Math.abs(hashString(seed?.trim() || 'default-avatar')) % avatarPalette.length]
  return {
    color: '#fff',
    background: paletteColor,
    fontWeight: 600,
  }
}

export const getNeutralAvatarStyle = (): CSSProperties => neutralAvatarStyle
