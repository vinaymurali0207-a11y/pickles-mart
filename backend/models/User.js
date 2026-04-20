const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: String,
    username: String,
    address: String,
    password: String
});

module.exports = mongoose.model('User', userSchema);
