/**
 * seed-admins.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Seed 3 predefined admin accounts into the database.
 *
 * This script:
 *   1. Generates 3 Algorand keypairs (deterministic AES-256 encrypted storage)
 *   2. Hashes default passwords with bcrypt
 *   3. Inserts admin records into the admins table
 *
 * Run: npx ts-node src/seed-admins.ts
 *
 * Default admin credentials (change in production):
 *   admin1@algocast.io / Admin1Pass!2026
 *   admin2@algocast.io / Admin2Pass!2026
 *   admin3@algocast.io / Admin3Pass!2026
 */

import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const db = require('./db');
const { generateCustodialWallet } = require('./wallet/custodialWallet');

import { createMultisigAccount } from './algorand/multisig';

// ── Admin Definitions ────────────────────────────────────────────────────────

const ADMIN_ACCOUNTS = [
  {
    email: 'admin1@algocast.io',
    password: 'Admin1Pass!2026',
    role: 'admin',
  },
  {
    email: 'admin2@algocast.io',
    password: 'Admin2Pass!2026',
    role: 'admin',
  },
  {
    email: 'admin3@algocast.io',
    password: 'Admin3Pass!2026',
    role: 'admin',
  },
];

// ── Seed Function ────────────────────────────────────────────────────────────

async function seedAdmins(): Promise<void> {
  console.log('[seed-admins] Starting admin account seeding...\n');

  const createdAdmins: Array<{ id: string; email: string; algorand_address: string }> = [];

  for (const adminDef of ADMIN_ACCOUNTS) {
    // Check if admin already exists
    const existing = db.getAdminByEmail(adminDef.email);
    if (existing) {
      console.log(`  ⏩ Admin ${adminDef.email} already exists (id: ${existing.id})`);
      createdAdmins.push({
        id: existing.id,
        email: existing.email,
        algorand_address: existing.algorand_address,
      });
      continue;
    }

    // Generate Algorand keypair
    const { address, encryptedKey } = generateCustodialWallet();

    // Hash password
    const hashed_password = await bcrypt.hash(adminDef.password, 12);

    // Insert admin into DB
    const admin = db.createAdmin({
      id: uuidv4(),
      email: adminDef.email,
      hashed_password,
      algorand_address: address,
      encrypted_private_key: encryptedKey,
      role: adminDef.role,
    });

    console.log(`  ✅ Created admin: ${adminDef.email}`);
    console.log(`     Address: ${address}`);
    console.log(`     Role: ${adminDef.role}`);
    console.log('');

    createdAdmins.push({
      id: admin.id,
      email: admin.email,
      algorand_address: address,
    });
  }

  // Derive and display multisig address
  if (createdAdmins.length === 3) {
    const addresses = createdAdmins.map(a => a.algorand_address);
    try {
      const { multisigAddress } = createMultisigAccount(addresses);
      console.log('─── Multisig Setup ─────────────────────────────────────');
      console.log(`  Multisig Address: ${multisigAddress}`);
      console.log(`  Threshold: 2-of-3`);
      console.log(`  Signers:`);
      createdAdmins.forEach((a, i) => {
        console.log(`    Admin ${i + 1}: ${a.email} → ${a.algorand_address}`);
      });
      console.log('');
    } catch (err: any) {
      console.error(`  ⚠️ Could not derive multisig address: ${err.message}`);
    }
  }

  console.log('[seed-admins] ✅ Admin seeding complete.\n');
  console.log('Default login credentials:');
  console.log('  POST /admin/login');
  ADMIN_ACCOUNTS.forEach(a => {
    console.log(`  { "email": "${a.email}", "password": "${a.password}" }`);
  });
}

// ── Run ──────────────────────────────────────────────────────────────────────

seedAdmins()
  .then(() => {
    console.log('\n[seed-admins] Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[seed-admins] Fatal error:', err);
    process.exit(1);
  });
