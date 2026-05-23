'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface Props {
  next?: string
}

export function GoogleSignInButton({ next }: Props) {
  const [loading, setLoading] = useState(false)

  async function onClick() {
    setLoading(true)
    const supabase = createClient()
    // After Google authorizes, Supabase will redirect to /api/auth/callback?code=...
    // with the optional `next` query param preserved so we land back on the right page.
    const redirectTo = new URL('/api/auth/callback', window.location.origin)
    if (next) redirectTo.searchParams.set('next', next)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo.toString() },
    })
    if (error) {
      setLoading(false)
      // eslint-disable-next-line no-alert
      alert(`Sign-in failed: ${error.message}`)
    }
    // On success Supabase redirects; no further work here.
  }

  return (
    <Button
      variant="gradient"
      size="lg"
      className="w-full"
      onClick={onClick}
      disabled={loading}
    >
      <GoogleIcon />
      {loading ? 'Redirecting…' : 'Continue with Google'}
    </Button>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#fff" d="M21.6 12.227c0-.71-.064-1.394-.182-2.045H12v3.868h5.382a4.603 4.603 0 0 1-1.995 3.018v2.51h3.227c1.887-1.74 2.986-4.296 2.986-7.351z" />
      <path fill="#fff" d="M12 22c2.7 0 4.964-.898 6.614-2.422l-3.227-2.51c-.895.6-2.041.954-3.387.954-2.605 0-4.81-1.76-5.598-4.124H3.064v2.59A9.997 9.997 0 0 0 12 22z" opacity=".82" />
      <path fill="#fff" d="M6.402 13.898A6.01 6.01 0 0 1 6.09 12c0-.659.114-1.302.313-1.898v-2.59H3.064A9.997 9.997 0 0 0 2 12c0 1.612.386 3.137 1.064 4.488l3.338-2.59z" opacity=".68" />
      <path fill="#fff" d="M12 6.978c1.47 0 2.787.506 3.823 1.497l2.867-2.867C16.96 3.998 14.696 3 12 3 8.092 3 4.715 5.236 3.064 8.512l3.338 2.59C7.19 8.738 9.395 6.978 12 6.978z" opacity=".5" />
    </svg>
  )
}
