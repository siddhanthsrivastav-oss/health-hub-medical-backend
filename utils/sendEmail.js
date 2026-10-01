const transporter = require('../config/email')

const sendEmail = async(to,subject,html)=>{
    try {
        await transporter.sendMail({
            from:process.env.EMAIL,
            to,
            subject,
            html
        })
        console.log("Email Sent! ");
    } catch (error) {
        console.error('EMAIL SEND ERROR:', error.message)
        throw error
    }
}
module.exports=sendEmail