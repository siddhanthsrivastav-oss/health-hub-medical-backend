const Users = require('../models/user');
const transporter = require('../config/email');

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Check email
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find user
    const user = await Users.findOne({
      email: email.toLowerCase()
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    // OTP expires after 10 minutes
    const otpExpires = new Date(
      Date.now() + 10 * 60 * 1000
    );

    // Save OTP
    user.resetOtp = otp;
    user.resetOtpExpires = otpExpires;

    await user.save();

    // Send OTP to email
    await transporter.sendMail({
      from: process.env.EMAIL,
      to: user.email,
      subject: 'Password Reset OTP',
      text: `Your password reset OTP is ${otp}. This OTP is valid for 10 minutes.`
    });

    return res.status(200).json({
      success: true,
      message: 'OTP sent to your email'
    });

  } catch (error) {
    console.error('Forgot password error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP'
    });
  }
};

module.exports = {
  forgotPassword
};