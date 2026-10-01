const express = require('express')
const { rateLimit } = require('express-rate-limit')
const {
    createAdmin,
    forgotPasswordAdmin,
    getAdmins,
    loginAdmin,
    resetPasswordAdmin
} = require('../controllers/adminController')
const auth = require('../middleware/auth')
const superAdminOnly = require('../middleware/superAdminOnly')

const adminRouter = express.Router()
const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many attempts. Please try again later.' }
})

adminRouter.post('/login', loginRateLimit, loginAdmin)
adminRouter.post('/forgot-password', loginRateLimit, forgotPasswordAdmin)
adminRouter.post('/reset-password', loginRateLimit, resetPasswordAdmin)
adminRouter.get('/admins', auth, superAdminOnly, getAdmins)
adminRouter.post('/admins', auth, superAdminOnly, createAdmin)

module.exports = adminRouter