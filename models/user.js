const mongoose = require('mongoose')

const savedAddressSchema = new mongoose.Schema(
    {
        label: {
            type: String,
            enum: ['Home', 'Work', 'Other'],
            default: 'Home'
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },
        phone: {
            type: String,
            required: true,
            match: /^[6-9]\d{9}$/
        },
        addressLine: {
            type: String,
            required: true,
            trim: true,
            minlength: 5,
            maxlength: 250
        },
        landmark: {
            type: String,
            trim: true,
            maxlength: 120,
            default: ''
        },
        pincode: {
            type: String,
            required: true,
            match: /^[1-9]\d{5}$/
        },
        city: {
            type: String,
            required: true,
            enum: ['Lucknow', 'Azamgarh', 'Kanpur', 'Gorakhpur']
        },
        isDefault: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
)

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            trim: true
        },

        email: {
            type: String,
            unique: true,
            sparse: true,
            required: false,
            lowercase: true,
            trim: true
        },

        phone: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },

        address: {
            name: { type: String, trim: true, maxlength: 100 },
            phone: { type: String, match: /^\d{10}$/ },
            addressLine: { type: String, trim: true, maxlength: 250 },
            landmark: { type: String, trim: true, maxlength: 120, default: '' },
            pincode: { type: String, match: /^[1-9]\d{5}$/ },
            city: {
                type: String,
                enum: ['Lucknow', 'Azamgarh', 'Kanpur', 'Gorakhpur']
            }
        },

        addresses: {
            type: [savedAddressSchema],
            default: []
        },

        password: {
            type: String
        },

        resetOtp: {
            type: String
        },

        resetOtpExpires: {
            type: Date
        },

        role: {
            type: String,
            enum: ['customer'],
            default: 'customer',
            required: true
        },

        // ================================
        // USER STATUS
        // ================================
        status: {
            type: String,
            enum: ['Active', 'Inactive'],
            default: 'Active'
        }
    },
    {
        timestamps: true
    }
)

module.exports = mongoose.model('Users', userSchema)