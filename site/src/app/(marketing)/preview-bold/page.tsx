import { redirect } from 'next/navigation';

// The bold preview was promoted to the homepage (/). Keep this path alive
// (shared links, bookmarks) by redirecting to the canonical home.
export default function PreviewBold() {
  redirect('/');
}
