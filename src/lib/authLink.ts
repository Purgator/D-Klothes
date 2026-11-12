/**
 * The sign-in email links straight to the app, with the single-use token hash in the URL
 * fragment: `<app>/auth/callback#token_hash=…&type=email`. A fragment never reaches the
 * web host, a link on the app's own domain reads better to spam filters than a redirect
 * through the backend, and a mail scanner that fetches the page does not use up the link.
 */
export function tokenHashFromFragment(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const tokenHash = params.get('token_hash')
  if (params.get('type') !== 'email' || !tokenHash) return null
  return /^[A-Za-z0-9_-]{16,256}$/.test(tokenHash) ? tokenHash : null
}
