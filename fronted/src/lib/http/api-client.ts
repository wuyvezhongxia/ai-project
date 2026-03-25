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

const TOKEN_STORAGE_KEY = 'pm-module-token'
// Keep the fallback payload minimal so display fields come from the backend DB,
// not from stale hardcoded values embedded in the token.
const DEV_FALLBACK_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMSIsInRlbmFudF9pZCI6IjAwMDAwMCIsImRlcHRfaWQiOiIxMDMiLCJyb2xlX2lkcyI6WyIxIl0sImV4cCI6MTg5MzQ1NjAwMCwiaWF0IjoxNzc0NDI4MjMxfQ.XjonoSrXNPT74lH74GlHyVHrqMWhNhGenejVVJKjQNk'

export const bootstrapTokenFromUrl = () => {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const token = url.searchParams.get('token')
  if (!token) return

  window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
  url.searchParams.delete('token')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

export const getStoredToken = () => {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? DEV_FALLBACK_TOKEN
}

export const setStoredToken = (token: string) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

type RequestOptions = RequestInit & {
  skipAuth?: boolean
}

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
