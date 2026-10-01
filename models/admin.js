const mongoose = require('mongoose')

const adminSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    role: {
        type: String,
        enum: ['admin', 'superadmin'],
        default: 'admin',
        required: true
    }
}, { timestamps: true })

module.exports = mongoose.model('Admin', adminSchema, 'admins')