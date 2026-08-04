'use strict';

const bcrypt = require('bcryptjs');
const config = require('../config');
const { pool } = require('./pool');

const WARDS = [
  { code: 'W01', name: 'Ward 1 — Sea Beach' },
  { code: 'W02', name: 'Ward 2 — Grand Road' },
  { code: 'W03', name: 'Ward 3 — Baliapanda' },
  { code: 'W04', name: 'Ward 4 — Matimandap' },
  { code: 'W05', name: 'Ward 5 — Dolamandap' },
  { code: 'W06', name: 'Ward 6 — Kundheibenta' },
  { code: 'W07', name: 'Ward 7 — Markandeswar Sahi' },
  { code: 'W08', name: 'Ward 8 — Goudabada Sahi' }
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const w of WARDS) {
      await client.query(
        `INSERT INTO wards (code, name)
         VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
        [w.code, w.name]
      );
    }

    const adminHash = await bcrypt.hash(config.seed.adminPassword, config.bcryptRounds);
    const officerHash = await bcrypt.hash(config.seed.officerPassword, config.bcryptRounds);

    await client.query(
      `INSERT INTO users (phone, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'admin')
       ON CONFLICT (phone) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         full_name = EXCLUDED.full_name,
         role = 'admin',
         is_active = TRUE`,
      [config.seed.adminPhone, 'admin@puri.gov.in', adminHash, 'Municipality Admin']
    );

    const wardRes = await client.query(`SELECT id FROM wards WHERE code = 'W01' LIMIT 1`);
    const wardId = wardRes.rows[0]?.id || null;

    await client.query(
      `INSERT INTO users (phone, email, password_hash, full_name, role, ward_id)
       VALUES ($1, $2, $3, $4, 'officer', $5)
       ON CONFLICT (phone) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         full_name = EXCLUDED.full_name,
         role = 'officer',
         ward_id = EXCLUDED.ward_id,
         is_active = TRUE`,
      [
        config.seed.officerPhone,
        'officer@puri.gov.in',
        officerHash,
        'Field Officer',
        wardId
      ]
    );

    // Ground agents for cow welfare (Puri 20 km)
    const agents = [
      {
        name: 'Gopal Pradhan',
        phone: '9777001001',
        area: 'Puri Beach – Grand Road',
        notes: 'Morning shift · bike unit'
      },
      {
        name: 'Sita Behera',
        phone: '9777001002',
        area: 'Baliapanda – Station',
        notes: 'Day shift · first aid kit'
      },
      {
        name: 'Rabi Mohanty',
        phone: '9777001003',
        area: 'Outer ring 10–20 km',
        notes: 'On-call ambulance link'
      }
    ];

    for (const a of agents) {
      await client.query(
        `INSERT INTO ground_agents (full_name, phone, area_coverage, notes, is_available, is_active)
         VALUES ($1, $2, $3, $4, TRUE, TRUE)
         ON CONFLICT (phone) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           area_coverage = EXCLUDED.area_coverage,
           notes = EXCLUDED.notes,
           is_active = TRUE`,
        [a.name, a.phone, a.area, a.notes]
      );
    }

    await client.query('COMMIT');
    console.log('Seed complete.');
    console.log(`  Admin phone:   ${config.seed.adminPhone}`);
    console.log(`  Officer phone: ${config.seed.officerPhone}`);
    console.log(`  Ground agents: ${agents.length} (cow welfare)`);
    console.log('  Change seed passwords before production.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
