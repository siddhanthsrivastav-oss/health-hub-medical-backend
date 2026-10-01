const Order = require('../models/order')
const Product = require('../models/product')
const mongoose = require('mongoose')
const crypto = require('crypto')
const Razorpay = require('razorpay')


/*
|--------------------------------------------------------------------------
| ORDER STATUSES
|--------------------------------------------------------------------------
*/

const orderStatuses = [
    'Placed',
    'Confirmed',
    'Packed',
    'Shipped',
    'OutForDelivery',
    'Delivered',
    'Cancelled'
]


/*
|--------------------------------------------------------------------------
| ALLOWED CITIES
|--------------------------------------------------------------------------
*/

const allowedCities = new Set([
    'Lucknow',
    'Azamgarh',
    'Kanpur',
    'Gorakhpur'
])


/*
|--------------------------------------------------------------------------
| TRACKING MESSAGES
|--------------------------------------------------------------------------
*/

const trackingMessages = {
    Placed: 'Your order has been placed successfully.',

    Confirmed: 'Your order has been confirmed.',

    Packed: 'Your order has been packed and is ready for shipping.',

    Shipped: 'Your order has been shipped.',

    OutForDelivery: 'Your order is out for delivery.',

    Delivered: 'Your order has been delivered successfully.',

    Cancelled: 'Your order has been cancelled.'
}


/*
|--------------------------------------------------------------------------
| PRICE ORDER
|--------------------------------------------------------------------------
*/

const priceOrder = async (items, address) => {

    if (
        !Array.isArray(items) ||
        items.length === 0 ||
        items.length > 50
    ) {
        return {
            error: 'Cart must contain between 1 and 50 products'
        }
    }


    const name = String(address?.name || '').trim()

    const phoneDigits = String(address?.phone || '')
        .replace(/\D/g, '')

    const phone =
        phoneDigits.length === 12 &&
        phoneDigits.startsWith('91')
            ? phoneDigits.slice(2)
            : phoneDigits

    const addressLine =
        String(address?.addressLine || '').trim()

    const landmark =
        String(address?.landmark || '').trim()

    const pincode =
        String(address?.pincode || '').trim()

    const city =
        String(address?.city || '').trim()


    if (
        !name ||
        name.length > 100 ||
        !/^\d{10}$/.test(phone) ||
        addressLine.length < 5 ||
        addressLine.length > 250 ||
        landmark.length > 120 ||
        !/^\d{6}$/.test(pincode) ||
        !allowedCities.has(city)
    ) {
        return {
            error: 'Enter valid delivery details and choose one of the supported cities'
        }
    }


    const requestedItems = new Map()


    for (const item of items) {

        const productId =
            String(item?.productId || '')

        const qty =
            Number(item?.qty)


        if (
            !mongoose.isValidObjectId(productId) ||
            !Number.isInteger(qty) ||
            qty < 1 ||
            qty > 20 ||
            requestedItems.has(productId)
        ) {
            return {
                error: 'Cart contains an invalid product or quantity'
            }
        }


        requestedItems.set(productId, qty)
    }


    const products = await Product.find({
        _id: {
            $in: [...requestedItems.keys()]
        }
    })


    if (products.length !== requestedItems.size) {
        return {
            error: 'One or more products are no longer available'
        }
    }


    const orderItems = products.map((product) => ({

        productId: product._id,

        productName: product.productName,

        qty: requestedItems.get(
            String(product._id)
        ),

        price: product.price,

        imageUrl: product.images?.[0]?.url

    }))


    const totalPaise =
        orderItems.reduce(
            (sum, item) =>
                sum +
                Math.round(item.price * 100) *
                item.qty,
            0
        )


    if (
        !Number.isSafeInteger(totalPaise) ||
        totalPaise <= 0
    ) {
        return {
            error: 'Order total is invalid'
        }
    }


    return {

        orderItems,

        totalPaise,

        address: {
            name,
            phone,
            addressLine,
            landmark,
            pincode,
            city
        }

    }
}


/*
|--------------------------------------------------------------------------
| RAZORPAY CLIENT
|--------------------------------------------------------------------------
*/

const getRazorpayClient = () => {

    if (
        !process.env.RAZORPAY_KEY_ID ||
        !process.env.RAZORPAY_KEY_SECRET
    ) {
        return null
    }


    return new Razorpay({

        key_id:
            process.env.RAZORPAY_KEY_ID,

        key_secret:
            process.env.RAZORPAY_KEY_SECRET

    })
}


/*
|--------------------------------------------------------------------------
| CREATE COD ORDER
|--------------------------------------------------------------------------
*/

exports.createOrder = async (req, res) => {

    try {

        const {
            items,
            address,
            paymentType = 'COD'
        } = req.body


        if (paymentType !== 'COD') {

            return res.status(400).json({

                message:
                    'Only Cash on Delivery is currently available'

            })
        }


        const pricedOrder =
            await priceOrder(
                items,
                address
            )


        if (pricedOrder.error) {

            return res.status(400).json({

                message:
                    pricedOrder.error

            })
        }


        const order = await Order.create({

            user: req.user.userId,

            items:
                pricedOrder.orderItems,

            totalAmount:
                pricedOrder.totalPaise / 100,

            address:
                pricedOrder.address,

            paymentType: 'COD',

            orderStatus: 'Placed',

            trackingHistory: [

                {

                    status: 'Placed',

                    message:
                        'Your order has been placed successfully.',

                    updatedAt:
                        new Date()

                }

            ]

        })


        res.status(201).json({

            message:
                'Order placed with Cash on Delivery',

            orderId:
                order._id,

            totalAmount:
                order.totalAmount

        })

    } catch (error) {

        console.error(
            'CREATE ORDER ERROR:',
            error.message
        )

        res.status(500).json({

            message:
                'Could not place order'

        })
    }
}


/*
|--------------------------------------------------------------------------
| CREATE RAZORPAY ORDER
|--------------------------------------------------------------------------
*/

exports.createRazorpayOrder = async (req, res) => {

    try {

        const razorpay =
            getRazorpayClient()


        if (!razorpay) {

            return res.status(503).json({

                message:
                    'Online payment is not configured yet. Please use Cash on Delivery.'

            })
        }


        const pricedOrder =
            await priceOrder(
                req.body.items,
                req.body.address
            )


        if (pricedOrder.error) {

            return res.status(400).json({

                message:
                    pricedOrder.error

            })
        }


        const gatewayOrder =
            await razorpay.orders.create({

                amount:
                    pricedOrder.totalPaise,

                currency:
                    'INR',

                receipt:
                    `order-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,

                notes: {
                    userId:
                        String(req.user.userId)
                }

            })


        const order =
            await Order.create({

                user:
                    req.user.userId,

                items:
                    pricedOrder.orderItems,

                totalAmount:
                    pricedOrder.totalPaise / 100,

                address:
                    pricedOrder.address,

                paymentType:
                    'Razorpay',

                orderStatus:
                    'PendingPayment',

                gatewayOrderId:
                    gatewayOrder.id,

                trackingHistory:
                    []

            })


        res.status(201).json({

            orderId:
                order._id,

            gatewayOrderId:
                gatewayOrder.id,

            amount:
                gatewayOrder.amount,

            currency:
                gatewayOrder.currency,

            keyId:
                process.env.RAZORPAY_KEY_ID,

            merchantName:
                process.env.STORE_NAME ||
                'HealthHub Medical'

        })

    } catch (error) {

        console.error(
            'CREATE RAZORPAY ORDER ERROR:',
            error.message
        )

        res.status(502).json({

            message:
                'Could not start online payment. Please try again or choose Cash on Delivery.'

        })
    }
}


/*
|--------------------------------------------------------------------------
| VERIFY RAZORPAY PAYMENT
|--------------------------------------------------------------------------
*/

exports.verifyRazorpayPayment = async (req, res) => {

    try {

        const {
            orderId,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body


        if (
            !orderId ||
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {

            return res.status(400).json({

                message:
                    'Payment verification details are incomplete'

            })
        }


        const order =
            await Order.findOne({

                _id:
                    orderId,

                user:
                    req.user.userId

            })


        if (
            !order ||
            order.paymentType !== 'Razorpay' ||
            order.gatewayOrderId !== razorpay_order_id
        ) {

            return res.status(404).json({

                message:
                    'Payment order not found'

            })
        }


        if (
            order.paymentStatus === 'Paid'
        ) {

            if (
                order.gatewayPaymentId ===
                razorpay_payment_id
            ) {

                return res.status(200).json({

                    message:
                        'Payment already verified',

                    orderId:
                        order._id,

                    totalAmount:
                        order.totalAmount

                })
            }


            return res.status(409).json({

                message:
                    'This order already has a verified payment'

            })
        }


        const secret =
            process.env.RAZORPAY_KEY_SECRET


        if (!secret) {

            return res.status(503).json({

                message:
                    'Payment verification is not configured'

            })
        }


        const expectedSignature =
            crypto
                .createHmac(
                    'sha256',
                    secret
                )
                .update(
                    `${razorpay_order_id}|${razorpay_payment_id}`
                )
                .digest()


        const receivedSignature =
            Buffer.from(
                razorpay_signature,
                'hex'
            )


        if (
            receivedSignature.length !==
            expectedSignature.length ||

            !crypto.timingSafeEqual(
                receivedSignature,
                expectedSignature
            )
        ) {

            return res.status(400).json({

                message:
                    'Payment signature is invalid'

            })
        }


        const razorpay =
            getRazorpayClient()


        if (!razorpay) {

            return res.status(503).json({

                message:
                    'Payment gateway is not configured'

            })
        }


        const payment =
            await razorpay.payments.fetch(
                razorpay_payment_id
            )


        const expectedAmount =
            Math.round(
                order.totalAmount * 100
            )


        if (
            payment.order_id !==
                order.gatewayOrderId ||

            payment.amount !==
                expectedAmount ||

            payment.currency !==
                'INR'
        ) {

            return res.status(400).json({

                message:
                    'Payment amount or order does not match'

            })
        }


        const capturedPayment =
            payment.status === 'authorized'

                ? await razorpay.payments.capture(
                    razorpay_payment_id,
                    expectedAmount,
                    'INR'
                )

                : payment


        if (
            capturedPayment.status !==
            'captured'
        ) {

            return res.status(409).json({

                message:
                    'Payment is not captured yet. Please contact support before retrying.'

            })
        }


        order.paymentStatus =
            'Paid'

        order.orderStatus =
            'Placed'

        order.gatewayPaymentId =
            razorpay_payment_id


        if (!Array.isArray(order.trackingHistory)) {

            order.trackingHistory = []

        }


        const alreadyPlaced =
            order.trackingHistory.some(
                item =>
                    item.status === 'Placed'
            )


        if (!alreadyPlaced) {

            order.trackingHistory.push({

                status:
                    'Placed',

                message:
                    'Payment successful. Your order has been placed.',

                updatedAt:
                    new Date()

            })

        }


        await order.save()


        res.status(200).json({

            message:
                'Payment verified and order placed',

            orderId:
                order._id,

            totalAmount:
                order.totalAmount

        })

    } catch (error) {

        console.error(
            'VERIFY RAZORPAY PAYMENT ERROR:',
            error.message
        )

        res.status(502).json({

            message:
                'Could not verify payment. Please contact support before trying again.'

        })
    }
}


/*
|--------------------------------------------------------------------------
| RAZORPAY WEBHOOK
|--------------------------------------------------------------------------
*/

exports.handleRazorpayWebhook = async (
    req,
    res
) => {

    const webhookSecret =
        process.env.RAZORPAY_WEBHOOK_SECRET


    const signature =
        req.headers['x-razorpay-signature']


    if (
        !webhookSecret ||
        !signature ||
        !Buffer.isBuffer(req.body)
    ) {

        return res.status(400).send(
            'Invalid webhook configuration or payload'
        )
    }


    const expectedSignature =
        crypto
            .createHmac(
                'sha256',
                webhookSecret
            )
            .update(req.body)
            .digest()


    const receivedSignature =
        Buffer.from(
            signature,
            'hex'
        )


    if (
        receivedSignature.length !==
            expectedSignature.length ||

        !crypto.timingSafeEqual(
            receivedSignature,
            expectedSignature
        )
    ) {

        return res.status(400).send(
            'Invalid webhook signature'
        )
    }


    try {

        const event =
            JSON.parse(
                req.body.toString('utf8')
            )


        if (
            event.event ===
            'payment.captured'
        ) {

            const payment =
                event.payload
                    ?.payment
                    ?.entity


            const order =
                await Order.findOne({

                    gatewayOrderId:
                        payment?.order_id,

                    paymentType:
                        'Razorpay'

                })


            if (
                !order ||
                payment.amount !==
                    Math.round(
                        order.totalAmount * 100
                    ) ||
                payment.currency !== 'INR'
            ) {

                return res.status(400).send(
                    'Payment does not match an order'
                )
            }


            if (
                order.paymentStatus !==
                'Paid'
            ) {

                order.paymentStatus =
                    'Paid'

                order.orderStatus =
                    'Placed'

                order.gatewayPaymentId =
                    payment.id


                if (
                    !Array.isArray(
                        order.trackingHistory
                    )
                ) {

                    order.trackingHistory = []

                }


                const alreadyPlaced =
                    order.trackingHistory.some(
                        item =>
                            item.status ===
                            'Placed'
                    )


                if (!alreadyPlaced) {

                    order.trackingHistory.push({

                        status:
                            'Placed',

                        message:
                            'Payment successful. Your order has been placed.',

                        updatedAt:
                            new Date()

                    })

                }


                await order.save()

            }

        }


        res.status(200).json({
            received: true
        })

    } catch (error) {

        console.error(
            'RAZORPAY WEBHOOK ERROR:',
            error.message
        )

        res.status(400).send(
            'Invalid webhook payload'
        )
    }
}


/*
|--------------------------------------------------------------------------
| GET ALL ORDERS - ADMIN
|--------------------------------------------------------------------------
*/

exports.getOrders = async (req, res) => {

    try {

        const orders =
            await Order.find()
                .populate(
                    'user',
                    'name email'
                )
                .sort({
                    createdAt: -1
                })
                .limit(250)


        res.status(200).json({
            orders
        })

    } catch (error) {

        console.error(
            'GET ORDERS ERROR:',
            error.message
        )

        res.status(500).json({

            message:
                'Could not load orders'

        })
    }
}


/*
|--------------------------------------------------------------------------
| UPDATE ORDER STATUS - ADMIN
|--------------------------------------------------------------------------
*/

exports.updateOrderStatus = async (
    req,
    res
) => {

    const { status } =
        req.body


    // Validate status
    if (
        !orderStatuses.includes(status)
    ) {

        return res.status(400).json({

            message:
                'Invalid order status'

        })
    }


    try {

        // Find order
        const order =
            await Order.findById(
                req.params.id
            )


        if (!order) {

            return res.status(404).json({

                message:
                    'Order not found'

            })
        }


        // Razorpay payment check
        if (
            order.paymentType ===
                'Razorpay' &&

            order.paymentStatus !==
                'Paid'
        ) {

            return res.status(409).json({

                message:
                    'Online payment must be verified before fulfillment'

            })
        }


        // Same status check
        if (
            order.orderStatus ===
            status
        ) {

            return res.status(400).json({

                message:
                    `Order is already ${status}`

            })
        }


        // Update status
        order.orderStatus =
            status


        // COD payment collected
        // when order delivered
        if (
            status === 'Delivered' &&
            order.paymentType === 'COD'
        ) {

            order.paymentStatus =
                'Collected'

        }


        // Make sure trackingHistory exists
        if (
            !Array.isArray(
                order.trackingHistory
            )
        ) {

            order.trackingHistory = []

        }


        // Add tracking history
        order.trackingHistory.push({

            status:
                status,

            message:
                trackingMessages[status] ||
                '',

            updatedAt:
                new Date()

        })


        await order.save()


        res.status(200).json({

            message:
                'Order status updated successfully',

            order

        })

    } catch (error) {

        console.error(
            'UPDATE ORDER ERROR:',
            error.message
        )

        res.status(500).json({

            message:
                'Could not update order'

        })
    }
}
/*
|--------------------------------------------------------------------------
| GET MY ORDERS - CUSTOMER
|--------------------------------------------------------------------------
*/

exports.getMyOrders = async (req, res) => {
    try {

        const orders = await Order.find({
            user: req.user.userId
        })
        .populate(
            'items.productId',
            'productName images price'
        )
        .sort({
            createdAt: -1
        })

        res.status(200).json({
            success: true,
            orders
        })

    } catch (error) {

        console.error(
            'GET MY ORDERS ERROR:',
            error.message
        )

        res.status(500).json({
            success: false,
            message: 'Could not load your orders'
        })
    }
}


/*
|--------------------------------------------------------------------------
| GET SINGLE MY ORDER - CUSTOMER
|--------------------------------------------------------------------------
*/

exports.getMyOrderById = async (req, res) => {
    try {

        const { id } = req.params

        // Validate MongoDB ID
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID'
            })
        }

        const order = await Order.findOne({
            _id: id,
            user: req.user.userId
        })
        .populate(
            'items.productId',
            'productName images price'
        )

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            })
        }

        res.status(200).json({
            success: true,
            order
        })

    } catch (error) {

        console.error(
            'GET MY ORDER ERROR:',
            error.message
        )

        res.status(500).json({
            success: false,
            message: 'Could not load order'
        })
    }
}
