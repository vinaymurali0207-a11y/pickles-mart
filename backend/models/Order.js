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

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userId: String,
    items: [orderItemSchema],
    subtotal: Number,
    status: {
        type: String,
        enum: ['placed', 'packed', 'shipped', 'delivered', 'cancelled'],
        default: 'placed'
    },
    deliveryAddress: String
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
