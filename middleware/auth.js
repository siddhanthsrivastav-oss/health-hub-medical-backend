const jwt = require('jsonwebtoken')

const auth = (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader) {
        return res.status(401).json({
            message: "Token Missing"
        })
    }

    const token = authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : authHeader

    try {
        const decode = jwt.verify(
            token,
            process.env.JWT_SECRET_KEY
        )

        req.user = decode

        next()

    } catch (error) {
        console.log("AUTH ERROR:", error.message)

        return res.status(401).json({
            message: "Invalid Token"
        })
    }
}

module.exports = auth