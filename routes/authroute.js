
const express = require('express');

const router = express.Router();

const { forgotPassword } = require('../controllers/authController');

console.log('✅ AUTH ROUTES LOADED');

router.post('/forgot-password', forgotPassword);

module.exports = router;