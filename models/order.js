const mongoose = require('mongoose')

const trackingSchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: [
                'Placed',
                'Confirmed',
                'Packed',
                'Shipped',
                'OutForDelivery',
                'Delivered',
                'Cancelled'
            ],
            required: true
        },

        message: {
            type: String,
            default: ''
        },

        updatedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        _id: false
    }
)


const orderSchema = new mongoose.Schema({

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users",
        required: true
    },

    items: [
        {
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product",
                required: true
            },

            productName: {
                type: String,
                required: true
            },

            qty: {
                type: Number,
                required: true,
                min: 1
            },

            price: {
                type: Number,
                required: true,
                min: 0
            },

            imageUrl: String
        }
    ],

    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },

    address: {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },

        phone: {
            type: String,
            required: true,
            match: /^\d{10}$/
        },

        addressLine: {
            type: String,
            required: true,
            trim: true,
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
            match: /^\d{6}$/
        },

        city: {
            type: String,
            required: true,
            enum: [
                'Lucknow',
                'Azamgarh',
                'Kanpur',
                'Gorakhpur'
            ]
        }
    },

    paymentType: {
        type: String,
        enum: [
            'COD',
            'Razorpay',
            'paytm',
            'goggle pay'
        ],
        default: 'COD',
        required: true
    },

    paymentStatus: {
        type: String,
        enum: [
            'Pending',
            'Collected',
            'Paid',
            'Failed'
        ],
        default: 'Pending'
    },

    orderStatus: {
        type: String,
        enum: [
            'PendingPayment',
            'Placed',
            'Confirmed',
            'Packed',
            'Shipped',
            'OutForDelivery',
            'Delivered',
            'Cancelled'
        ],
        default: 'Placed'
    },

    // ==========================
    // ORDER TRACKING HISTORY
    // ==========================

    trackingHistory: {
        type: [trackingSchema],
        default: []
    },

    gatewayOrderId: {
        type: String,
        unique: true,
        sparse: true
    },

    gatewayPaymentId: {
        type: String,
        unique: true,
        sparse: true
    }

}, {
    timestamps: true
})


module.exports = mongoose.model('Orders', orderSchema)