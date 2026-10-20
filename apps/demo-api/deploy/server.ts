/**
 * Static playground host for Deno Deploy.
 *
 * Only the browser UI is deployed here; the API keeps running on Node,
 * because it needs a filesystem (log4js), Swagger's on-disk assets and three
 * workspace packages that Deno cannot resolve by path. See the README.
 *
 * Deploy with:  deno deploy --project <name> --no-wait
 *
 * The UI's API origin is injected here rather than edited into app.js, so the
 * same files stay correct whether they are served locally by the API or from
 * this host.
 */

const API_BASE = Deno.env.get('API_BASE') ?? ''
if (!API_BASE) {
  // A deploy without API_BASE looks fine and then 404s on every request, so this
  // warning is the one signal an operator gets. Intentional console output, not
  // leftover debugging.
  // biome-ignore lint/suspicious/noConsole: operator-facing deploy misconfiguration warning
  console.warn(
    'API_BASE is not set - the UI will call its own origin and every request will 404. ' +
      'Set it to the deployed API origin, e.g. https://polygon-did-api.example.com'
  )
}

const ROOT = new URL('../public/', import.meta.url)

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

const contentType = (path: string) => {
  const dot = path.lastIndexOf('.')
  return (dot === -1 ? undefined : CONTENT_TYPES[path.slice(dot)]) ?? 'application/octet-stream'
}

/** The page is the only file that needs the API origin baked in. */
const withApiBase = (html: string) =>
  html.replace(/(<meta name="api-base" content=")(")/, `$1${API_BASE.replace(/"/g, '&quot;')}$2`)

const handler = async (request: Request): Promise<Response> => {
  const { pathname } = new URL(request.url)

  // Root-only page route, matching the Node app: unknown paths must stay 404
  // rather than silently serving the UI.
  const file = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')

  // Reject traversal before touching the filesystem.
  if (file.includes('..')) return new Response('Bad request', { status: 400 })

  try {
    const url = new URL(file, ROOT)
    const body = await Deno.readFile(url)
    const type = contentType(file)

    return new Response(type.startsWith('text/html') ? withApiBase(new TextDecoder().decode(body)) : body, {
      headers: {
        'content-type': type,
        // The UI is versioned with the API, so keep it fresh but cheap.
        'cache-control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=300',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

Deno.serve(handler)
