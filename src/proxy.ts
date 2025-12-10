import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create Supabase client with cookie handling
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
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
        remove(name: string, options: any) {
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

  const { pathname } = request.nextUrl

  // Allow access to login and register pages without authentication
  if (pathname === '/login' || pathname === '/register') {
    return response
  }

  // In development, bypass auth checks so protected pages like /dashboard/discover
  // are directly reachable for UI testing.
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true') {
    return response
  }

  const protectedRoutes = ['/dashboard']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  if (isProtectedRoute) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      const url = new URL('/login', request.url)
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }

    // Check completion status for profile/edit and preferences pages
    if (pathname === '/dashboard/profile/edit' || pathname === '/dashboard/profile/preferences') {
      const { data: progress } = await supabase
        .from('user_progress')
        .select('profile_completed, preferences_completed')
        .eq('user_id', user.id)
        .single()

      // Allow access to edit page if profile not completed
      // Allow access to preferences if profile completed but preferences not
      if (pathname === '/dashboard/profile/preferences' && progress && !progress.profile_completed) {
        return NextResponse.redirect(new URL('/dashboard/profile/edit', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/login',
    '/register'
  ]
}
