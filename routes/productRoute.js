const express = require('express')
const { rateLimit } = require('express-rate-limit')

const productRouter = express.Router()

const {
    createProduct,
    getProducts,
    getProductById,
    rateProduct,
    deleteProduct
} = require('../controllers/productController')

const upload = require('../middleware/upload')
const auth = require('../middleware/auth')
const adminOnly = require('../middleware/adminOnly')

productRouter.post(
    '/create',
    auth,
    adminOnly,
    upload.array('images', 5),
    createProduct
)

productRouter.get(
    '/get-all',
    getProducts
)

productRouter.get(
    '/get/:id',
    getProductById
)

productRouter.post(
    '/rating/:id',
    auth,
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 30,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { message: 'Too many ratings. Please try again later.' }
    }),
    rateProduct
)

productRouter.delete('/delete/:id', auth, adminOnly, deleteProduct)

module.exports = productRouter