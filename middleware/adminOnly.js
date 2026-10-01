const Admin = require('../models/admin')

const adminOnly = async (req, res, next) => {
    try {
        if (req.user.accountType !== 'admin') {
            return res.status(403).json({ message: 'Administrator access required' })
        }

        const admin = await Admin.findById(req.user.userId).select('role')

        if (!admin || !['admin', 'superadmin'].includes(admin.role)) {
            return res.status(403).json({ message: 'Administrator access required' })
        }

        next()
    } catch (error) {
        console.error('ADMIN AUTH ERROR:', error.message)
        res.status(500).json({ message: 'Could not verify administrator access' })
    }
}

module.exports = adminOnly