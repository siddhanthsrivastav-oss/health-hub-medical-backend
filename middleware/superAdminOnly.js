const Admin = require('../models/admin')

const superAdminOnly = async (req, res, next) => {
    try {
        if (req.user.accountType !== 'admin') {
            return res.status(403).json({ message: 'Superadmin access required' })
        }

        const admin = await Admin.findById(req.user.userId).select('role')
        if (!admin || admin.role !== 'superadmin') {
            return res.status(403).json({ message: 'Superadmin access required' })
        }

        next()
    } catch (error) {
        console.error('SUPERADMIN AUTH ERROR:', error.message)
        res.status(500).json({ message: 'Could not verify superadmin access' })
    }
}

module.exports = superAdminOnly