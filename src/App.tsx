import { useEffect, useState } from 'react'

type ApiData = {
  message: string
  items: string[]
}

type View = 'home' | 'about'

export default function App() {
  const [view, setView] = useState<View>('home')
  const [data, setData] = useState<ApiData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/data')
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        return res.json() as Promise<ApiData>
      })
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Unknown error'),
      )
  }, [])

  return (
    <>
      <nav>
        <a href="#" onClick={() => setView('home')}>
          Home
        </a>
        <a href="#" onClick={() => setView('about')}>
          About
        </a>
      </nav>

      {view === 'home' ? (
        <main>
          <h1>Welcome to React + Express on Vercel 🚀</h1>
          <p>The Express API is served as a Vercel serverless function.</p>

          <h2>API Data</h2>
          {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
          {!error && !data && <p>Loading…</p>}
          {data && (
            <>
              <p>{data.message}</p>
              <ul>
                {data.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </main>
      ) : (
        <main>
          <h1>About</h1>
          <p>
            This is a simple web app demonstrating how to use a React frontend
            with an Express.js API on Vercel. The React app is a static SPA
            served by Vercel's CDN, and the Express app handles requests under{' '}
            <code>/api</code>.
          </p>
        </main>
      )}
    </>
  )
}
