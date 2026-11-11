import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// SameSite does not distinguish sibling subdomains. Browser mutations must
// declare the exact configured app origin; missing Origin fails closed too.
export function isAllowedRequestOrigin(method: string, origin: string | null, appUrl: string | undefined): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return true
  if (!origin || !appUrl) return false
  try {
    const app = new URL(appUrl)
    const caller = new URL(origin)
    const safeProtocol = app.protocol === 'https:' ||
      (app.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(app.hostname))
    return safeProtocol && !app.username && !app.password && app.pathname === '/' && !app.search && !app.hash &&
      origin === caller.origin && caller.origin === app.origin
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  if (!isAllowedRequestOrigin(request.method, request.headers.get('origin'), process.env.NEXT_PUBLIC_APP_URL)) {
    return NextResponse.json({ error: 'Forbidden' }, {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!api/health|api/ready|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
