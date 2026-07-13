import express from 'express'

const app = express()

app.use(express.json())

// Example API endpoint - JSON
app.get('/api/data', (req, res) => {
  res.json({
    message: 'Here is some sample API data',
    items: ['apple', 'banana', 'cherry'],
  })
})

// Health check
app.get('/api/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Local dev only: run a standalone server so Vite can proxy to it.
// On Vercel the exported app is used directly as the serverless handler.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 8080
  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`)
  })
}

export default app
