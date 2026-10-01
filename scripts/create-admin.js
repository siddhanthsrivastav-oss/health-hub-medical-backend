const dns = require('dns')
try {
    dns.setServers(['8.8.8.8', '8.8.4.4'])
} catch (e) {}

const readline = require('node:readline/promises')
const path = require('node:path')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const dotenv = require('dotenv')
const Admin = require('../models/admin')

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const main = async () => {
    if (!process.env.Mongo_URI) {
        throw new Error('Mongo_URI is missing from Backend/.env')
    }

    const args = process.argv.slice(2)
    let name, email, password, roleInput

    if (args.length >= 2) {
        // Fast command line mode: node scripts/create-admin.js <email> <password> [name] [role]
        email = String(args[0]).trim().toLowerCase()
        password = String(args[1])
        name = args[2] ? String(args[2]).trim() : 'Super Admin'
        roleInput = args[3] ? String(args[3]).trim().toLowerCase() : 'superadmin'
    } else {
        // Interactive terminal input mode
        const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
        try {
            console.log('\n--- Create Admin Account ---')
            email = (await terminal.question('Admin Email: ')).trim().toLowerCase()
            password = await terminal.question('Admin Password (minimum 8 characters): ')
            name = (await terminal.question('Admin Name (default: Super Admin): ')).trim() || 'Super Admin'
            roleInput = (await terminal.question('Role [superadmin/admin] (default: superadmin): ')).trim().toLowerCase() || 'superadmin'
        } finally {
            terminal.close()
        }
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        throw new Error('A valid email address is required (e.g. admin@example.com)')
    }
    if (!password || password.length < 8) {
        throw new Error('Password must be at least 8 characters long')
    }
    if (!['admin', 'superadmin'].includes(roleInput)) {
        throw new Error('Role must be "admin" or "superadmin"')
    }

    console.log('\nConnecting to database...')
    await mongoose.connect(process.env.Mongo_URI)

    const existing = await Admin.findOne({ email })
    if (existing) {
        throw new Error(`Admin with email "${email}" already exists!`)
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const admin = await Admin.create({
        name,
        email,
        role: roleInput,
        password: hashedPassword
    })

    console.log('\n====================================')
    console.log(` Admin Created Successfully!`)
    console.log(` Name:     ${admin.name}`)
    console.log(` Email:    ${admin.email}`)
    console.log(` Role:     ${admin.role}`)
    console.log('====================================\n')
}

main()
    .catch((error) => {
        console.error(`\n Admin creation failed: ${error.message}\n`)
        process.exitCode = 1
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect()
        }
    })