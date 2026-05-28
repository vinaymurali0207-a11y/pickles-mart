const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    userId: String,
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    },
    username: String,
    productName: String,
    price: Number,
    image: String,
    weight: String,
    rating: Number,
    reviewText: String,
    verified: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Review', reviewSchema);
