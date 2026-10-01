const User = require('../models/user')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const otpStore = require('../utils/otpStore')
const sendEmail = require('../utils/sendEmail')
const Product = require('../models/product')
const Order = require('../models/order')


// ========================================
// NORMALIZE EMAIL
// ========================================

const normalizeEmail = (email) => {
    return String(email || '').trim().toLowerCase()
}

const normalizePhone = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '')
    return digits.startsWith('91') && digits.length === 12
        ? digits.slice(2)
        : digits
}

const isValidPhone = (phone) => /^[6-9]\d{9}$/.test(phone)
const isLocalOtpPreview = (req) =>
    process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1'].includes(req.hostname) &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)

const findCustomerByPhone = async (phone, linkLegacyAccount = false) => {
    const user = await User.findOne({ phone })
    if (user) return { user, ambiguous: false }

    const userIds = await Order.distinct('user', { 'address.phone': phone })
    if (userIds.length > 1) return { user: null, ambiguous: true }
    if (userIds.length === 0) return { user: null, ambiguous: false }

    const legacyUser = await User.findOne({
        _id: userIds[0],
        role: 'customer',
        phone: { $exists: false }
    })
    if (!legacyUser) return { user: null, ambiguous: false }

    if (linkLegacyAccount) {
        legacyUser.phone = phone
        await legacyUser.save()
    }

    return { user: legacyUser, ambiguous: false }
}

const validAddressLabels = new Set(['Home', 'Work', 'Other'])
const supportedAddressCities = new Set(['Lucknow', 'Azamgarh', 'Kanpur', 'Gorakhpur'])

const cleanSavedAddress = (input = {}) => ({
    label: String(input.label || 'Home').trim(),
    name: String(input.name || '').trim(),
    phone: normalizePhone(input.phone),
    addressLine: String(input.addressLine || '').trim(),
    landmark: String(input.landmark || '').trim(),
    pincode: String(input.pincode || '').trim(),
    city: String(input.city || '').trim()
})

const validateSavedAddress = (address) => (
    validAddressLabels.has(address.label) &&
    address.name.length > 0 && address.name.length <= 100 &&
    isValidPhone(address.phone) &&
    address.addressLine.length >= 5 && address.addressLine.length <= 250 &&
    address.landmark.length <= 120 &&
    /^[1-9]\d{5}$/.test(address.pincode) &&
    supportedAddressCities.has(address.city)
)

const syncDefaultAddress = (user) => {
    const defaultAddress = user.addresses.find((address) => address.isDefault) || user.addresses[0]
    user.address = defaultAddress
        ? {
            name: defaultAddress.name,
            phone: defaultAddress.phone,
            addressLine: defaultAddress.addressLine,
            landmark: defaultAddress.landmark,
            pincode: defaultAddress.pincode,
            city: defaultAddress.city
        }
        : undefined
}

const migrateLegacyAddress = async (user) => {
    if (!user.addresses.length && user.address?.addressLine) {
        const legacyAddress = user.address.toObject
            ? user.address.toObject()
            : user.address
        user.addresses.push({ ...legacyAddress, label: 'Home', isDefault: true })
        await user.save()
    }
    if (user.addresses.length && !user.addresses.some((address) => address.isDefault)) {
        user.addresses[0].isDefault = true
        syncDefaultAddress(user)
        await user.save()
    }
}

const getCustomerById = (customerId) => User.findOne({
    _id: customerId,
    role: 'customer'
})

const serializeCustomer = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    addresses: user.addresses,
    role: user.role,
    status: user.status
})


// ========================================
// PHONE OTP AUTHENTICATION
// ========================================

exports.sendPhoneOtp = async (req, res) => {
    try {
        const phone = normalizePhone(req.body.phone)

        if (!isValidPhone(phone)) {
            return res.status(400).json({
                message: 'Enter a valid 10-digit Indian mobile number'
            })
        }

        const { user: existingUser, ambiguous } = await findCustomerByPhone(phone)
        if (ambiguous) {
            return res.status(409).json({
                message: 'This mobile number is linked to multiple accounts. Please contact the administrator.'
            })
        }
        if (existingUser?.status === 'Inactive') {
            return res.status(403).json({
                message: 'Your account has been deactivated. Please contact the administrator.'
            })
        }

        let debugOtp
        if (isLocalOtpPreview(req)) {
            debugOtp = String(Math.floor(100000 + Math.random() * 900000))
            otpStore.set(`phone-otp:${phone}`, {
                otp: debugOtp,
                expiresAt: Date.now() + 5 * 60 * 1000
            })
        } else {
            if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID) {
                return res.status(503).json({
                    message: 'Phone verification is not configured. Contact the store administrator.'
                })
            }

            const query = new URLSearchParams({
                template_id: process.env.MSG91_TEMPLATE_ID,
                mobile: `91${phone}`,
                otp_length: '6',
                otp_expiry: '5'
            })
            const response = await fetch(`https://control.msg91.com/api/v5/otp?${query}`, {
                method: 'POST',
                headers: {
                    authkey: process.env.MSG91_AUTH_KEY,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify({})
            })
            const result = await response.json()

            if (!response.ok || result.type === 'error') {
                console.error('MSG91 OTP SEND ERROR:', result)
                return res.status(502).json({
                    message: 'Could not send OTP. Please try again.'
                })
            }
        }

        return res.status(200).json({
            message: 'OTP sent to your mobile number',
            requiresRegistration: !existingUser,
            ...(debugOtp ? { debugOtp } : {})
        })
    } catch (error) {
        console.error('PHONE OTP SEND ERROR:', error.message)
        return res.status(500).json({ message: 'Could not send OTP. Please try again.' })
    }
}

exports.verifyPhoneOtp = async (req, res) => {
    try {
        const phone = normalizePhone(req.body.phone)
        const otp = String(req.body.otp || '').trim()

        if (!isValidPhone(phone) || !/^\d{4,8}$/.test(otp)) {
            return res.status(400).json({ message: 'Enter a valid mobile number and OTP' })
        }

        if (isLocalOtpPreview(req)) {
            const storedOtp = otpStore.get(`phone-otp:${phone}`)
            if (!storedOtp || storedOtp.expiresAt < Date.now() || storedOtp.otp !== otp) {
                return res.status(400).json({ message: 'Invalid or expired OTP. Please try again.' })
            }
            otpStore.delete(`phone-otp:${phone}`)
        } else {
            if (!process.env.MSG91_AUTH_KEY || !process.env.JWT_SECRET_KEY) {
                return res.status(503).json({ message: 'Phone verification is not configured.' })
            }

            const query = new URLSearchParams({
                mobile: `91${phone}`,
                otp
            })
            const response = await fetch(`https://control.msg91.com/api/v5/otp/verify?${query}`, {
                headers: {
                    authkey: process.env.MSG91_AUTH_KEY,
                    Accept: 'application/json'
                }
            })
            const result = await response.json()

            if (!response.ok || result.type !== 'success') {
                return res.status(400).json({ message: 'Invalid or expired OTP. Please try again.' })
            }
        }

        const { user: matchedUser, ambiguous } = await findCustomerByPhone(phone, true)
        if (ambiguous) {
            return res.status(409).json({
                message: 'This mobile number is linked to multiple accounts. Please contact the administrator.'
            })
        }

        if (!matchedUser) {
            otpStore.set(`phone-verified:${phone}`, {
                expiresAt: Date.now() + 10 * 60 * 1000
            })
            return res.status(200).json({
                message: 'Mobile number verified',
                registrationRequired: true
            })
        }

        const user = matchedUser
        if (user.status === 'Inactive') {
            return res.status(403).json({
                message: 'Your account has been deactivated. Please contact the administrator.'
            })
        }

        if (!process.env.JWT_SECRET_KEY) {
            return res.status(500).json({ message: 'Login is temporarily unavailable.' })
        }

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET_KEY,
            { expiresIn: '7d' }
        )
        const userData = {
            id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            address: user.address,
            addresses: user.addresses,
            role: user.role,
            status: user.status
        }

        return res.status(200).json({ message: 'Login successful', token, userData })
    } catch (error) {
        console.error('PHONE OTP VERIFY ERROR:', error.message)
        if (error.code === 11000) {
            return res.status(409).json({ message: 'An account with this mobile number already exists' })
        }
        return res.status(500).json({ message: 'Could not verify OTP. Please try again.' })
    }
}

exports.completePhoneRegistration = async (req, res) => {
    try {
        const phone = normalizePhone(req.body.phone)
        const name = String(req.body.name || '').trim()
        const address = req.body.address || {}
        const verifiedPhone = otpStore.get(`phone-verified:${phone}`)
        const supportedCities = ['Lucknow', 'Azamgarh', 'Kanpur', 'Gorakhpur']

        if (!isValidPhone(phone) || !verifiedPhone || verifiedPhone.expiresAt < Date.now()) {
            otpStore.delete(`phone-verified:${phone}`)
            return res.status(401).json({ message: 'Verify your mobile number again to continue' })
        }

        const cleanAddress = {
            name,
            phone,
            addressLine: String(address.addressLine || '').trim(),
            landmark: String(address.landmark || '').trim(),
            pincode: String(address.pincode || '').trim(),
            city: String(address.city || '').trim()
        }

        if (
            !name || name.length > 100 ||
            cleanAddress.addressLine.length < 5 || cleanAddress.addressLine.length > 250 ||
            cleanAddress.landmark.length > 120 ||
            !/^[1-9]\d{5}$/.test(cleanAddress.pincode) ||
            !supportedCities.includes(cleanAddress.city)
        ) {
            return res.status(400).json({ message: 'Enter valid name and delivery address details' })
        }

        if (!process.env.JWT_SECRET_KEY) {
            return res.status(500).json({ message: 'Registration is temporarily unavailable.' })
        }

        const { user: existingUser, ambiguous } = await findCustomerByPhone(phone)
        if (ambiguous) {
            return res.status(409).json({ message: 'This mobile number is linked to multiple accounts.' })
        }
        if (existingUser) {
            otpStore.delete(`phone-verified:${phone}`)
            return res.status(409).json({ message: 'An account with this number already exists. Please log in.' })
        }

        const user = await User.create({
            name: name.slice(0, 100),
            phone,
            address: cleanAddress,
            addresses: [{ ...cleanAddress, label: 'Home', isDefault: true }],
            role: 'customer',
            status: 'Active'
        })
        otpStore.delete(`phone-verified:${phone}`)

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET_KEY,
            { expiresIn: '7d' }
        )
        const userData = {
            id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            address: user.address,
            addresses: user.addresses,
            role: user.role,
            status: user.status
        }

        return res.status(201).json({ message: 'Account created', token, userData })
    } catch (error) {
        console.error('PHONE REGISTRATION ERROR:', error.message)
        if (error.code === 11000) {
            return res.status(409).json({ message: 'An account with this number already exists. Please log in.' })
        }
        return res.status(500).json({ message: 'Could not create account. Please try again.' })
    }
}

exports.getCustomerProfile = async (req, res) => {
    try {
        const user = await getCustomerById(req.user.userId)
        if (!user) return res.status(404).json({ message: 'Customer not found' })

        await migrateLegacyAddress(user)
        return res.status(200).json({ user: serializeCustomer(user) })
    } catch (error) {
        console.error('GET CUSTOMER PROFILE ERROR:', error.message)
        return res.status(500).json({ message: 'Could not load your profile' })
    }
}

exports.updateCustomerProfile = async (req, res) => {
    try {
        const user = await getCustomerById(req.user.userId)
        if (!user) return res.status(404).json({ message: 'Customer not found' })

        const name = String(req.body.name || '').trim()
        if (!name || name.length > 100) {
            return res.status(400).json({ message: 'Enter a name up to 100 characters' })
        }

        user.name = name
        if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
            const email = normalizeEmail(req.body.email)
            if (email && !/^\S+@\S+\.\S+$/.test(email)) {
                return res.status(400).json({ message: 'Enter a valid email address' })
            }
            user.email = email || undefined
        }

        await user.save()
        return res.status(200).json({ message: 'Profile updated', user: serializeCustomer(user) })
    } catch (error) {
        console.error('UPDATE CUSTOMER PROFILE ERROR:', error.message)
        if (error.code === 11000) {
            return res.status(409).json({ message: 'That email address is already in use' })
        }
        return res.status(500).json({ message: 'Could not update your profile' })
    }
}

exports.addCustomerAddress = async (req, res) => {
    try {
        const user = await getCustomerById(req.user.userId)
        if (!user) return res.status(404).json({ message: 'Customer not found' })
        await migrateLegacyAddress(user)

        const address = cleanSavedAddress(req.body)
        if (!validateSavedAddress(address)) {
            return res.status(400).json({ message: 'Enter valid address details' })
        }

        const makeDefault = req.body.isDefault === true || user.addresses.length === 0
        if (makeDefault) user.addresses.forEach((item) => { item.isDefault = false })
        user.addresses.push({ ...address, isDefault: makeDefault })
        syncDefaultAddress(user)
        await user.save()

        return res.status(201).json({
            message: 'Address saved',
            address: user.addresses[user.addresses.length - 1],
            user: serializeCustomer(user)
        })
    } catch (error) {
        console.error('ADD CUSTOMER ADDRESS ERROR:', error.message)
        return res.status(500).json({ message: 'Could not save this address' })
    }
}

exports.updateCustomerAddress = async (req, res) => {
    try {
        const user = await getCustomerById(req.user.userId)
        if (!user) return res.status(404).json({ message: 'Customer not found' })
        await migrateLegacyAddress(user)

        const address = cleanSavedAddress(req.body)
        if (!validateSavedAddress(address)) {
            return res.status(400).json({ message: 'Enter valid address details' })
        }

        const savedAddress = user.addresses.id(req.params.addressId)
        if (!savedAddress) return res.status(404).json({ message: 'Address not found' })

        if (req.body.isDefault === true) {
            user.addresses.forEach((item) => { item.isDefault = false })
        }
        savedAddress.set({ ...address, isDefault: req.body.isDefault === true || savedAddress.isDefault })
        syncDefaultAddress(user)
        await user.save()

        return res.status(200).json({ message: 'Address updated', user: serializeCustomer(user) })
    } catch (error) {
        console.error('UPDATE CUSTOMER ADDRESS ERROR:', error.message)
        return res.status(500).json({ message: 'Could not update this address' })
    }
}

exports.setDefaultCustomerAddress = async (req, res) => {
    try {
        const user = await getCustomerById(req.user.userId)
        if (!user) return res.status(404).json({ message: 'Customer not found' })

        const savedAddress = user.addresses.id(req.params.addressId)
        if (!savedAddress) return res.status(404).json({ message: 'Address not found' })

        user.addresses.forEach((item) => { item.isDefault = item._id.equals(savedAddress._id) })
        syncDefaultAddress(user)
        await user.save()

        return res.status(200).json({ message: 'Default address updated', user: serializeCustomer(user) })
    } catch (error) {
        console.error('SET DEFAULT ADDRESS ERROR:', error.message)
        return res.status(500).json({ message: 'Could not update the default address' })
    }
}

exports.deleteCustomerAddress = async (req, res) => {
    try {
        const user = await getCustomerById(req.user.userId)
        if (!user) return res.status(404).json({ message: 'Customer not found' })

        const savedAddress = user.addresses.id(req.params.addressId)
        if (!savedAddress) return res.status(404).json({ message: 'Address not found' })

        const removedDefault = savedAddress.isDefault
        savedAddress.deleteOne()
        if (removedDefault && user.addresses.length) user.addresses[0].isDefault = true
        syncDefaultAddress(user)
        await user.save()

        return res.status(200).json({ message: 'Address deleted', user: serializeCustomer(user) })
    } catch (error) {
        console.error('DELETE CUSTOMER ADDRESS ERROR:', error.message)
        return res.status(500).json({ message: 'Could not delete this address' })
    }
}


// ========================================
// REGISTER USER
// ========================================

exports.registerUser = async (req, res) => {

    const { name, email, password } = req.body

    try {

        const normalizedEmail = normalizeEmail(email)

        if (
            !name?.trim() ||
            !/^\S+@\S+\.\S+$/.test(normalizedEmail) ||
            typeof password !== 'string' ||
            password.length < 8
        ) {
            return res.status(400).json({
                message:
                    'Name, valid email, and a password of at least 8 characters are required'
            })
        }


        const existingUser = await User.findOne({
            email: normalizedEmail
        })

        if (existingUser) {
            return res.status(409).json({
                message: 'An account with this email already exists'
            })
        }


        const hashPassword = await bcrypt.hash(
            password,
            10
        )


        const user = new User({
            name: name.trim(),
            email: normalizedEmail,
            password: hashPassword,
            role: 'customer',
            status: 'Active'
        })


        await user.save()


        res.status(201).json({
            message: 'User Created!'
        })

    } catch (error) {

        console.error(
            'REGISTER ERROR:',
            error
        )


        if (error.code === 11000) {
            return res.status(409).json({
                message:
                    'An account with this email already exists'
            })
        }


        return res.status(500).json({
            message: 'Error creating user!'
        })
    }
}


// ========================================
// LOGIN USER
// ========================================

exports.loginUser = async (req, res) => {

    try {

        const { email, password } = req.body

        const normalizedEmail =
            normalizeEmail(email)


        if (
            !normalizedEmail ||
            typeof password !== 'string' ||
            !password
        ) {
            return res.status(400).json({
                message:
                    'Email and password are required'
            })
        }


        const user = await User.findOne({
            email: {
                $regex: new RegExp(
                    `^${normalizedEmail.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        '\\$&'
                    )}$`,
                    'i'
                )
            }
        })


        if (!user) {
            return res.status(400).json({
                message:
                    'No account exists for this email. Check the email or create an account.'
            })
        }


        if (user.role !== 'customer') {
            return res.status(403).json({
                message:
                    'Administrator accounts must use the admin login'
            })
        }


        // ========================================
        // CHECK USER STATUS
        // ========================================

        if (user.status === 'Inactive') {
            return res.status(403).json({
                message:
                    'Your account has been deactivated. Please contact the administrator.'
            })
        }


        const match = user.password
            ? await bcrypt.compare(
                password,
                user.password
            )
            : false


        if (!match) {
            return res.status(400).json({
                message:
                    'Incorrect password. Please try again or reset your password.'
            })
        }


        if (!process.env.JWT_SECRET_KEY) {

            console.error(
                'LOGIN ERROR: JWT_SECRET_KEY is not configured'
            )

            return res.status(500).json({
                message:
                    'Login is temporarily unavailable. Server configuration is incomplete.'
            })
        }


        const token = jwt.sign(
            {
                userId: user._id,
                role: user.role
            },
            process.env.JWT_SECRET_KEY,
            {
                expiresIn: '7d'
            }
        )


        const userData = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status
        }


        res.status(200).json({
            message: 'Login Successfully',
            token,
            userData
        })

    } catch (error) {

        console.error(
            'LOGIN ERROR:',
            error.message
        )


        return res.status(500).json({
            message: 'Error during login'
        })
    }
}


// ========================================
// FORGOT PASSWORD
// ========================================

exports.forgetPassword = async (req, res) => {

    try {

        const { email } = req.body

        const normalizedEmail =
            normalizeEmail(email)


        const user = await User.findOne({
            email: {
                $regex: new RegExp(
                    `^${normalizedEmail.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        '\\$&'
                    )}$`,
                    'i'
                )
            }
        })


        if (!user) {
            return res.status(400).json({
                message: 'User not Found'
            })
        }


        const otp = Math.floor(
            1000 +
            Math.random() * 9000
        ).toString()


        otpStore.set(
            normalizedEmail,
            {
                otp,
                expiresAt:
                    Date.now() +
                    5 * 60 * 1000
            }
        )


        await sendEmail(
            normalizedEmail,
            'Reset Password OTP',
            `
            <h2>Password reset</h2>
            <p>Your OTP for password reset is <strong>${otp}</strong></p>
            <p>Valid for 5 minutes only.</p>
            `
        )


        res.status(200).json({
            message: 'Otp Sent'
        })

    } catch (error) {

        console.error(
            'FORGOT PASSWORD ERROR:',
            error
        )


        res.status(500).json({
            message: 'Error sending otp'
        })
    }
}


// ========================================
// RESET PASSWORD
// ========================================

exports.resetPassword = async (req, res) => {

    try {

        const {
            email,
            otp,
            password
        } = req.body


        const normalizedEmail =
            normalizeEmail(email)


        if (
            !normalizedEmail ||
            !otp ||
            typeof password !== 'string' ||
            password.length < 8
        ) {
            return res.status(400).json({
                message:
                    'Email, OTP and password of at least 8 characters are required'
            })
        }


        const data =
            otpStore.get(
                normalizedEmail
            )


        if (!data) {
            return res.status(404).json({
                message: 'OTP Not Found'
            })
        }


        if (
            Date.now() >
            data.expiresAt
        ) {

            otpStore.delete(
                normalizedEmail
            )

            return res.status(400).json({
                message: 'OTP Expired'
            })
        }


        if (data.otp !== otp) {
            return res.status(400).json({
                message: 'OTP Invalid'
            })
        }


        const hashPassword =
            await bcrypt.hash(
                password,
                10
            )


        await User.findOneAndUpdate(
            {
                email: {
                    $regex: new RegExp(
                        `^${normalizedEmail.replace(
                            /[.*+?^${}()|[\]\\]/g,
                            '\\$&'
                        )}$`,
                        'i'
                    )
                }
            },
            {
                password:
                    hashPassword
            }
        )


        otpStore.delete(
            normalizedEmail
        )


        res.status(200).json({
            message:
                'Password reset Successfully'
        })

    } catch (error) {

        console.error(
            'RESET PASSWORD ERROR:',
            error
        )


        res.status(500).json({
            message: 'Server Error'
        })
    }
}


// ========================================
// GET ALL USERS
// ========================================

exports.getUsers = async (req, res) => {
    try {
        const users = await User.find()
            .select('name email phone role status createdAt')
            .sort({ createdAt: -1 })

        return res.status(200).json({ users })
    } catch (error) {
        console.error('GET USERS ERROR:', error.message)
        return res.status(500).json({ message: 'Could not fetch users' })
    }
}


// ========================================
// DELETE USER
// ========================================

exports.toggleUserStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)

        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }

        user.status = user.status === 'Active' ? 'Inactive' : 'Active'
        await user.save()

        return res.status(200).json({
            message: user.status === 'Active'
                ? 'User activated successfully'
                : 'User deactivated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                status: user.status
            }
        })
    } catch (error) {
        console.error('TOGGLE USER STATUS ERROR:', error.message)
        return res.status(500).json({ message: 'Could not update user status' })
    }
}

exports.deleteUser = async (req, res) => {

    try {

        const { id } = req.params


        const user =
            await User.findById(id)


        if (!user) {
            return res.status(404).json({
                message:
                    'User not found'
            })
        }


        await User.findByIdAndDelete(
            id
        )


        res.status(200).json({
            message:
                'User deleted successfully'
        })

    } catch (error) {

        console.error(
            'DELETE USER ERROR:',
            error
        )


        res.status(500).json({
            message:
                'Could not delete user'
        })
    }
}


// ========================================
// ADMIN DASHBOARD STATS
// ========================================

exports.getAdminStats = async (req, res) => {

    try {

        // ========================================
        // TOTAL MEDICINES
        // ========================================

        const totalMedicines =
            await Product.countDocuments()


        // ========================================
        // START OF TODAY
        // ========================================

        const startOfDay =
            new Date()

        startOfDay.setHours(
            0,
            0,
            0,
            0
        )


        // ========================================
        // END OF TODAY
        // ========================================

        const endOfDay =
            new Date()

        endOfDay.setHours(
            23,
            59,
            59,
            999
        )


        // ========================================
        // TODAY'S ORDERS
        // ========================================

        const dailyOrders =
            await Order.countDocuments({
                createdAt: {
                    $gte: startOfDay,
                    $lte: endOfDay
                }
            })


        res.status(200).json({

            totalMedicines,

            dailyOrders

        })

    } catch (error) {

        console.error(
            'ADMIN STATS ERROR:',
            error
        )


        res.status(500).json({
            message:
                'Could not load admin stats'
        })
    }
}