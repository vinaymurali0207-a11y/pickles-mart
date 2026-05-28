const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    category: {
        type: String,
        required: true,
        enum: ['veg', 'nonveg', 'fish']
    },
    image: String,
    description: String,
    basePrice: {
        type: Number,
        required: true,
        min: 0
    },
    stock: {
        type: Number,
        default: 100
    },
    active: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
