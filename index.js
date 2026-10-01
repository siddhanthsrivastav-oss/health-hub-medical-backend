const dns = require('dns')
try {
  dns.setServers(['8.8.8.8', '8.8.4.4'])
} catch (e) {
  // Ignore if not supported in environment
}

const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const helmet = require('helmet')
const { rateLimit } = require('express-rate-limit')
const dotenv = require('dotenv')
const path = require('path')

const app = express()

dotenv.config({ path: path.join(__dirname, '.env') })

const { handleRazorpayWebhook } = require('./controllers/orderController')

app.post(
  '/api/order/payment/webhook',
  express.raw({ type: 'application/json' }),
  handleRazorpayWebhook
)

const allowedOrigins = new Set(
  (
    process.env.CORS_ORIGINS ||
    'http://localhost:5175,http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
)

app.disable('x-powered-by')

app.use(helmet())

app.use(express.json({ limit: '1mb' }))

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true)
      }

      return callback(new Error('Origin is not allowed by CORS'))
    }
  })
)

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  })
)

const PORT = process.env.PORT || 3000

app.get('/', (req, res) => {
  res.send('I am coming from backend 😊')
})

app.get('/api/health', (req, res) => {
  res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({
    status:
      mongoose.connection.readyState === 1
        ? 'ok'
        : 'database_unavailable',
    database: mongoose.connection.name || null
  })
})


// ================================
// AUTH ROUTES
// ================================
const authRouter = require('./routes/authroute')
app.use('/api/auth', authRouter)
const adminRouter = require('./routes/adminRoute')
app.use('/api/admin', adminRouter)
app.post('/api/test-forgot', (req, res) => {
  res.json({
    success: true,
    message: 'Direct route is working'
  })
})

// ================================
// USER ROUTES
// ================================
const userRouter = require('./routes/userRoute')
app.use('/api/user', userRouter)


// ================================
// CATEGORY ROUTES
// ================================
const categoryRouter = require('./routes/categoryRoute')
app.use('/api/category', categoryRouter)


// ================================
// PRODUCT ROUTES
// ================================ 
const productRouter = require('./routes/productRoute')
app.use('/api/product', productRouter)


// ================================
// ORDER ROUTES
// ================================
const orderRouter = require('./routes/orderRoute')
app.use('/api/order', orderRouter)


const startServer = async () => {
  if (!process.env.Mongo_URI) {
    throw new Error('Mongo_URI is missing from Backend/.env')
  }

  await mongoose.connect(process.env.Mongo_URI)

  console.log(
    `MongoDB connected to database: ${mongoose.connection.name}`
  )

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`)
  })
}

startServer().catch((error) => {
  console.error('Backend startup failed:', error.message)
  process.exit(1)
})