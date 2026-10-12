import { NextResponse } from 'next/server'
import { auth } from '@/auth'

/**
 * Gates the admin surface (`/admin/*`) and its API routes (`/api/*`).
 *
 * - Production: fully disabled (404), unchanged from before — the CMS only ever
 *   runs on preview/staging and locally.
 * - Local development: no login gate. localhost is not internet-exposed, so this
 *   keeps the dev loop friction-free.
 * - Preview / staging: requires a signed-in Google user on the @pingcap.com
 *   domain (domain enforcement lives in the `signIn` callback in `@/auth`).
 */
export default auth((req) => {
  const { pathname } = req.nextUrl
  const vercelEnv = process.env.VERCEL_ENV

  if (vercelEnv === 'production') {
    return new NextResponse(null, { status: 404 })
  }

  if (!vercelEnv) {
    return NextResponse.next()
  }

  // Auth.js endpoints must stay reachable so the sign-in round-trip can complete.
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // `req.auth` is set only for a session that cleared the @pingcap.com signIn gate.
  if (req.auth) {
    return NextResponse.next()
  }

  // Unauthenticated: APIs get a 401; browser navigation is sent to Google sign-in.
  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const signInUrl = new URL('/api/auth/signin', req.nextUrl.origin)
  signInUrl.searchParams.set('callbackUrl', req.nextUrl.href)
  return NextResponse.redirect(signInUrl)
})

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
}
