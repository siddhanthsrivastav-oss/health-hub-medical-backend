const orderRouter = require('express').Router()

const {
    createOrder,
    createRazorpayOrder,
    verifyRazorpayPayment,
    getOrders,
    updateOrderStatus,
    getMyOrders,
    getMyOrderById
} = require('../controllers/orderController')

const auth = require('../middleware/auth')
const adminOnly = require('../middleware/adminOnly')


// ================= CUSTOMER =================

// Create COD order
orderRouter.post(
    '/create-order',
    auth,
    createOrder
)

// Create Razorpay order
orderRouter.post(
    '/payment/create',
    auth,
    createRazorpayOrder
)

// Verify Razorpay payment
orderRouter.post(
    '/payment/verify',
    auth,
    verifyRazorpayPayment
)

// Get logged-in user's all orders
orderRouter.get(
    '/my-orders',
    auth,
    getMyOrders
)

// Get logged-in user's single order
orderRouter.get(
    '/my-orders/:id',
    auth,
    getMyOrderById
)


// ================= ADMIN =================

// Get all orders
orderRouter.get(
    '/all',
    auth,
    adminOnly,
    getOrders
)

// Update order status
orderRouter.patch(
    '/:id/status',
    auth,
    adminOnly,
    updateOrderStatus
)


module.exports = orderRouter