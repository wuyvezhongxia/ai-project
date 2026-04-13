/**
 * 前端统一 HTTP 封装：相对路径请求同源 `/api/*`，解析后端 `{ code, message, data }` 信封。
 * - 成功：`code === 0`，返回 `data`（泛型 T）
 * - 失败：抛出 `ApiClientError`（含 HTTP 状态或业务 `code` / `message`）
 */
type ApiSuccess<T> = {
  code: 0
  message: string
  data: T
}

type ApiFailure = {
  code: number
  message: string
  details?: unknown
}

export class ApiClientError extends Error {
  code?: number
  details?: unknown

  constructor(message: string, code?: number, details?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.details = details
  }
}

/** localStorage 中 JWT 的 key；开发环境无 token 时会用下方 DEV_FALLBACK_TOKEN */
const TOKEN_STORAGE_KEY = 'pm-module-token'
// Keep the fallback payload minimal so display fields come from the backend DB,
// not from stale hardcoded values embedded in the token.
const DEV_FALLBACK_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMSIsInRlbmFudF9pZCI6IjAwMDAwMCIsImRlcHRfaWQiOiIxMDMiLCJyb2xlX2lkcyI6WyIxIl0sImV4cCI6MTg5MzQ1NjAwMCwiaWF0IjoxNzc0NDI4MjMxfQ.XjonoSrXNPT74lH74GlHyVHrqMWhNhGenejVVJKjQNk'

/** 从 URL `?token=` 写入本地并去掉 query，便于内嵌页带登录态 */
export const bootstrapTokenFromUrl = () => {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const token = url.searchParams.get('token')
  if (!token) return

  window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
  url.searchParams.delete('token')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

/** 读取当前请求用的 Bearer Token（无则开发兜底） */
export const getStoredToken = () => {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? DEV_FALLBACK_TOKEN
}

/** 登录成功后写入 Token */
export const setStoredToken = (token: string) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

type RequestOptions = RequestInit & {
  skipAuth?: boolean
}

/**
 * 发 JSON 请求；默认带 `Authorization: Bearer <token>`。
 * @param path 如 `/api/tasks/dashboard`（由 Vite 等代理到后端）
 * @param options 同 fetch；`skipAuth: true` 时不带 Token
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, headers, ...rest } = options
  const token = getStoredToken()

  const response = await fetch(path, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
      ...(!skipAuth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  const payload = (await response.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null

  if (!response.ok) {
    throw new ApiClientError(payload?.message ?? `Request failed: ${response.status}`, response.status, payload)
  }

  if (!payload || payload.code !== 0 || !('data' in payload)) {
    throw new ApiClientError(payload?.message ?? 'Invalid API response', payload?.code, payload)
  }

  return payload.data
}
