'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock } from 'lucide-react'

// SHA-256 of team password
const HASH = '55e3ea977ca713bbeec2f9ec75784e7399702a9275fcfe0b37e4f31f3e38ec82'
const STORAGE_KEY = 'ambr-team-auth'
const SESSION_DAYS = 7

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function isSessionValid(): boolean {
  if (typeof window === 'undefined') return false
  const ts = localStorage.getItem(STORAGE_KEY)
  if (!ts) return false
  return Date.now() - Number(ts) < SESSION_DAYS * 86_400_000
}

export function TeamAuthGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isSessionValid()) setUnlocked(true)
    setChecking(false)
  }, [])

  useEffect(() => {
    if (!checking && !unlocked) inputRef.current?.focus()
  }, [checking, unlocked])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const val = inputRef.current?.value || ''
    if (await sha256(val) === HASH) {
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
      setUnlocked(true)
    } else {
      setError(true)
      if (inputRef.current) { inputRef.current.value = ''; inputRef.current.focus() }
      setTimeout(() => setError(false), 2000)
    }
  }

  if (checking) return null
  if (unlocked) return <>{children}</>

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-8"
      >
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber/10">
            <Lock className="h-5 w-5 text-amber" />
          </div>
          <h1 className="font-serif text-xl text-text-primary">Team Dashboard</h1>
          <p className="text-sm text-text-secondary">Enter team password to continue</p>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            className={`w-full rounded-lg border bg-surface-elevated px-4 py-3 text-sm text-text-primary placeholder-text-secondary/50 outline-none transition-colors ${
              error ? 'border-error/50 focus:border-error/70' : 'border-border focus:border-amber/50'
            }`}
          />
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="mt-2 text-xs text-error"
              >
                Wrong password
              </motion.p>
            )}
          </AnimatePresence>
          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-amber/15 py-2.5 text-sm font-medium text-amber transition-colors hover:bg-amber/25"
          >
            Unlock
          </button>
        </form>
      </motion.div>
    </div>
  )
}
