const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    userId: String,
    items: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product'
            },
            name: String,
            price: Number,
            weight: {
                type: String,
                default: '100g'
            },
            qty: Number
        }
    ]
});

module.exports = mongoose.model('Cart', cartSchema);
