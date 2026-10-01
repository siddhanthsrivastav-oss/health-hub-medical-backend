const express = require('express')

const userRouter = express.Router()

const { rateLimit } = require('express-rate-limit')

const {
    registerUser,
    sendPhoneOtp,
    verifyPhoneOtp,
    completePhoneRegistration,
    getCustomerProfile,
    updateCustomerProfile,
    addCustomerAddress,
    updateCustomerAddress,
    setDefaultCustomerAddress,
    deleteCustomerAddress,
    forgetPassword,
    resetPassword,
    getUsers,
    getAdminStats,
    toggleUserStatus,
    deleteUser
} = require('../controllers/userController')

const auth = require('../middleware/auth')

const adminOnly = require('../middleware/adminOnly')

const customerOnly = (req, res, next) => {
    if (req.user?.role !== 'customer') {
        return res.status(403).json({ message: 'Customer account required' })
    }
    return next()
}


const createAuthRateLimit = (limit) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        message: 'Too many attempts. Please try again later.'
    }
})

const authRateLimit = createAuthRateLimit(10)
const otpSendRateLimit = createAuthRateLimit(10)
const otpVerifyRateLimit = createAuthRateLimit(10)


// ========================================
// CUSTOMER AUTH
// ========================================

userRouter.post(
    '/register',
    authRateLimit,
    registerUser
)

userRouter.post(
    '/send-otp',
    otpSendRateLimit,
    sendPhoneOtp
)

userRouter.post(
    '/verify-otp',
    otpVerifyRateLimit,
    verifyPhoneOtp
)

userRouter.post(
    '/register-phone',
    authRateLimit,
    completePhoneRegistration
)

userRouter.post(
    '/forgot-password',
    authRateLimit,
    forgetPassword
)

userRouter.post(
    '/reset-password',
    authRateLimit,
    resetPassword
)

userRouter.get('/profile', auth, customerOnly, getCustomerProfile)
userRouter.patch('/profile', auth, customerOnly, updateCustomerProfile)
userRouter.post('/addresses', auth, customerOnly, addCustomerAddress)
userRouter.put('/addresses/:addressId', auth, customerOnly, updateCustomerAddress)
userRouter.patch('/addresses/:addressId/default', auth, customerOnly, setDefaultCustomerAddress)
userRouter.delete('/addresses/:addressId', auth, customerOnly, deleteCustomerAddress)


// ========================================
// ADMIN - USERS
// ========================================

// Get all users
userRouter.get(
    '/all',
    auth,
    adminOnly,
    getUsers
)


// Activate / Deactivate user
userRouter.patch(
    '/status/:id',
    auth,
    adminOnly,
    toggleUserStatus
)


// Delete user
userRouter.delete(
    '/delete/:id',
    auth,
    adminOnly,
    deleteUser
)


// ========================================
// ADMIN DASHBOARD STATS
// ========================================

userRouter.get(
    '/admin-stats',
    auth,
    adminOnly,
    getAdminStats
)


// ========================================
// CHECK TOKEN
// ========================================

userRouter.get(
    '/check-token',
    auth,
    (req, res) => {

        res.status(200).json({

            message: 'Token is valid',

            user: req.user

        })

    }
)


module.exports = userRouter