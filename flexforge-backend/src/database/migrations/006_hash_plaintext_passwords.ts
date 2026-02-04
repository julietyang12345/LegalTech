/**
 * Migration: Hash Plaintext Passwords
 *
 * This script migrates existing plaintext passwords to bcrypt hashes.
 * Run this ONCE after deploying the bcrypt password fix.
 *
 * Usage (local with Docker):
 *   docker exec -it flexforge-db-prod psql -U flexforge -d flexforge_dev -c "SELECT email FROM users;"
 *   npx ts-node src/database/migrations/006_hash_plaintext_passwords.ts
 *
 * Usage (with environment variables):
 *   DB_HOST=localhost DB_PORT=5432 DB_USERNAME=flexforge DB_PASSWORD=xxx DB_DATABASE=flexforge_dev \
 *   npx ts-node src/database/migrations/006_hash_plaintext_passwords.ts
 *
 * Usage (production via Docker):
 *   docker exec -it flexforge-api-prod npx ts-node src/database/migrations/006_hash_plaintext_passwords.ts
 */

import { Client } from 'pg';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

// Try to load .env file manually if it exists
const envPath = path.join(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && !key.startsWith('#')) {
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value.trim();
      }
    }
  });
}

const BCRYPT_ROUNDS = 10;

// Bcrypt hashes always start with $2a$, $2b$, or $2y$
const isBcryptHash = (password: string): boolean => {
  return /^\$2[aby]\$\d{2}\$/.test(password);
};

async function migratePasswords() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'flexforge',
    password: process.env.DB_PASSWORD || 'flexforge_dev_password',
    database: process.env.DB_DATABASE || 'flexforge_dev',
  });

  try {
    console.log('🔐 Password Migration Script');
    console.log('============================\n');

    await client.connect();
    console.log('✅ Connected to database\n');

    // Fetch all users
    const result = await client.query(
      'SELECT id, email, password FROM users ORDER BY "createdAt"'
    );

    const users = result.rows;
    console.log(`📊 Found ${users.length} users to check\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      const { id, email, password } = user;

      // Skip if already hashed
      if (isBcryptHash(password)) {
        console.log(`⏭️  Skipping ${email} - already hashed`);
        skippedCount++;
        continue;
      }

      // Skip if password is empty or null
      if (!password) {
        console.log(`⚠️  Skipping ${email} - no password set`);
        skippedCount++;
        continue;
      }

      try {
        // Hash the plaintext password
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // Update the user's password
        await client.query(
          'UPDATE users SET password = $1 WHERE id = $2',
          [hashedPassword, id]
        );

        console.log(`✅ Migrated ${email}`);
        migratedCount++;
      } catch (err) {
        console.error(`❌ Error migrating ${email}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n============================');
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⏭️  Skipped:  ${skippedCount}`);
    console.log(`   ❌ Errors:   ${errorCount}`);
    console.log('============================\n');

    if (errorCount > 0) {
      console.log('⚠️  Some passwords failed to migrate. Please check errors above.');
      process.exit(1);
    }

    console.log('✅ Password migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run migration
migratePasswords();
