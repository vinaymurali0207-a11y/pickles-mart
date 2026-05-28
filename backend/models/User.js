const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: String,
    firstName: String,
    lastName: String,
    username: String,
    address: String,
    password: String,
    verifiedReviewer: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('User', userSchema);
