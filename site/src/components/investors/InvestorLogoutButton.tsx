'use client';

export default function InvestorLogoutButton() {
  async function onClick() {
    await fetch('/api/v1/investors/logout', { method: 'POST' });
    window.location.href = '/';
  }

  return (
    <button
      onClick={onClick}
      className="font-mono text-xs text-text-secondary/60 hover:text-amber transition-colors"
    >
      sign out
    </button>
  );
}
