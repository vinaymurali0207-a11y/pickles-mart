const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    name: String,
    weight: String,
    unitPrice: Number,
    qty: Number,
    total: Number
}, { _id: false });

const addressSnapshotSchema = new mongoose.Schema({
    name: String,
    mobile: String,
    houseNo: String,
    street: String,
    area: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String,
    formatted: String
}, { _id: false });

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userId: String,
    items: [orderItemSchema],
    subtotal: Number,
    discount: {
        type: Number,
        default: 0
    },
    deliveryFee: {
        type: Number,
        default: 0
    },
    tax: {
        type: Number,
        default: 0
    },
    totalAmount: Number,
    status: {
        type: String,
        enum: ['Order Placed', 'Payment Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'placed', 'packed', 'shipped', 'delivered', 'cancelled'],
        default: 'Order Placed'
    },
    paymentMethod: {
        type: String,
        default: 'cod'
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
        default: 'Pending'
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    deliveryMethod: String,
    deliveryEstimate: String,
    deliveryAddress: mongoose.Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
