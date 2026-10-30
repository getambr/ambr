'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

const SESSION_KEY = 'ambr_dashboard_session';
const SESSION_TTL = 86_400_000; // 24 hours

/**
 * Smart nav CTA — shows "Dashboard" for returning users with an active
 * session, "Get Started" for new visitors. Checks localStorage for the
 * dashboard session token (same key used by the dashboard page).
 */
export default function SmartCTA({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts < SESSION_TTL) {
        setHasSession(true);
      }
    } catch {
      // localStorage unavailable or corrupt session
    }
  }, []);

  // When the user already has a dashboard session, the static nav in
  // Navigation.tsx already shows a "Dashboard" link — rendering SmartCTA
  // here too produced a duplicate (reported 2026-05-26 morning). Return
  // null in that case; visitors without a session still see "Get Started".
  if (hasSession) return null;

  return (
    <Link
      href="/activate"
      onClick={onClick}
      className={className}
    >
      Get an API key
    </Link>
  );
}
