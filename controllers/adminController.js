const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { randomInt } = require('node:crypto')
const Admin = require('../models/admin')
const otpStore = require('../utils/otpStore')
const sendEmail = require('../utils/sendEmail')

const normalizeEmail = (email) => String(email || '').trim().toLowerCase()

exports.loginAdmin = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email)
        const { password } = req.body

        if (!email || typeof password !== 'string' || !password) {
            return res.status(400).json({ message: 'Email and password are required' })
        }

        const admin = await Admin.findOne({ email }).select('+password')
        if (!admin || !(await bcrypt.compare(password, admin.password))) {
            return res.status(401).json({ message: 'Invalid admin email or password' })
        }

        if (!process.env.JWT_SECRET_KEY) {
            return res.status(500).json({ message: 'Login is temporarily unavailable' })
        }

        const token = jwt.sign(
            { userId: admin._id, role: admin.role, accountType: 'admin' },
            process.env.JWT_SECRET_KEY,
            { expiresIn: '7d' }
        )

        res.status(200).json({
            message: 'Login successful',
            token,
            adminData: { name: admin.name, email: admin.email, role: admin.role }
        })
    } catch (error) {
        console.error('ADMIN LOGIN ERROR:', error.message)
        res.status(500).json({ message: 'Error during admin login' })
    }
}

exports.createAdmin = async (req, res) => {
    try {
        const name = String(req.body.name || '').trim()
        const email = normalizeEmail(req.body.email)
        const { password } = req.body

        if (!name || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ message: 'Name, valid email, and a password of at least 8 characters are required' })
        }

        const admin = await Admin.create({
            name,
            email,
            password: await bcrypt.hash(password, 12),
            role: 'admin'
        })

        res.status(201).json({
            message: 'Admin created successfully',
            admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role }
        })
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: 'An admin with this email already exists' })
        }

        console.error('CREATE ADMIN ERROR:', error.message)
        res.status(500).json({ message: 'Could not create admin' })
    }
}

exports.getAdmins = async (req, res) => {
    try {
        const admins = await Admin.find().select('name email role createdAt').sort({ createdAt: -1 })
        res.status(200).json({ admins })
    } catch (error) {
        console.error('GET ADMINS ERROR:', error.message)
        res.status(500).json({ message: 'Could not load admins' })
    }
}

exports.forgotPasswordAdmin = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email)
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ message: 'A valid email is required' })
        }

        const admin = await Admin.findOne({ email })
        if (admin) {
            const otp = String(randomInt(100000, 1000000))
            otpStore.set(`admin:${email}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })
            await sendEmail(
                email,
                'Admin password reset OTP',
                `<h2>Password reset</h2><p>Your OTP is ${otp}</p><p>Valid for 5 minutes.</p>`
            )
        }

        res.status(200).json({ message: 'If an admin account exists, a reset OTP has been sent' })
    } catch (error) {
        console.error('ADMIN FORGOT PASSWORD ERROR:', error.message)
        res.status(500).json({ message: 'Could not send password reset OTP' })
    }
}

exports.resetPasswordAdmin = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email)
        const { otp, password } = req.body
        const storedOtp = otpStore.get(`admin:${email}`)

        if (!storedOtp) {
            return res.status(404).json({ message: 'OTP not found or expired' })
        }
        if (Date.now() > storedOtp.expiresAt) {
            otpStore.delete(`admin:${email}`)
            return res.status(400).json({ message: 'OTP expired' })
        }
        if (storedOtp.otp !== String(otp || '')) {
            return res.status(400).json({ message: 'OTP is invalid' })
        }
        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ message: 'Password must contain at least 8 characters' })
        }

        const admin = await Admin.findOne({ email })
        if (!admin) {
            otpStore.delete(`admin:${email}`)
            return res.status(404).json({ message: 'Admin account not found' })
        }

        admin.password = await bcrypt.hash(password, 12)
        await admin.save()
        otpStore.delete(`admin:${email}`)
        res.status(200).json({ message: 'Password changed successfully' })
    } catch (error) {
        console.error('ADMIN RESET PASSWORD ERROR:', error.message)
        res.status(500).json({ message: 'Could not reset admin password' })
    }
}