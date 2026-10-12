import { NextResponse } from 'next/server'
import { auth } from '@/auth'

/**
 * Gates the admin surface (`/admin/*`) and its API routes (`/api/*`).
 *
 * - Production: fully disabled (404), unchanged from before.
 * - Any deployed branch other than `staging` (per-PR previews, etc.): also 404,
 *   so the admin only ever appears on the single staging deployment — shrinking
 *   the exposed surface to one known host.
 * - Local development: no login gate. localhost is not internet-exposed, so this
 *   keeps the dev loop friction-free.
 * - Staging preview: requires a signed-in Google user on the @pingcap.com domain
 *   (domain enforcement lives in the `signIn` callback in `@/auth`). The staging
 *   URL is public, so login — not obscurity — is what actually protects it.
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

  // Deployed but not the staging branch (VERCEL_ENV is 'preview' for every branch
  // preview, so distinguish by the deployed git ref). Hide admin on those too.
  if (process.env.VERCEL_GIT_COMMIT_REF !== 'staging') {
    return new NextResponse(null, { status: 404 })
  }

  // Auth.js endpoints must stay reachable so the sign-in round-trip can complete.
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // The custom sign-in page itself must be reachable without a session, otherwise
  // redirecting unauthenticated users to it would loop.
  if (pathname === '/admin/login') {
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
