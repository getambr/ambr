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

  return (
    <Link
      href={hasSession ? '/dashboard' : '/activate'}
      onClick={onClick}
      className={className}
    >
      {hasSession ? 'Dashboard' : 'Get Started'}
    </Link>
  );
}
