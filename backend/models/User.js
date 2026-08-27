const mongoose = require('mongoose');

const addressItemSchema = new mongoose.Schema({
    name: String,
    mobile: String,
    houseNo: String,
    street: String,
    area: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String,
    isDefault: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const userSchema = new mongoose.Schema({
    userId: String,
    firstName: String,
    lastName: String,
    username: String,
    address: String,
    addressDetails: {
        houseNo: String,
        area: String,
        city: String,
        state: String,
        pincode: String,
        landmark: String
    },
    addresses: [addressItemSchema],
    profileImage: String,
    password: String,
    verifiedReviewer: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
