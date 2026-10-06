import 'dotenv/config';
import { getDb } from '../db.js';
import { sql } from 'drizzle-orm';

const VALID_CRANE_IDS = [
  '7ad0d658-71a1-49cf-a96d-e38e914fbaa1', // Travelift 50T
  'e487c8cc-b5a5-4c21-a201-68b79212d3ba', // Stacionarna dizalica 5T
  'ee85e94d-8490-4d61-9c42-a4375f6382e6', // Mala dizalica
];

async function main() {
  const db = await getDb();
  if (!db) {
    console.error('Database connection failed');
    process.exit(1);
  }

  console.log('Starting crane cleanup...');

  // 1. Reassign any reservations referencing non-valid cranes to Travelift 50T
  const defaultCraneId = '7ad0d658-71a1-49cf-a96d-e38e914fbaa1';
  await db.execute(sql`
    UPDATE reservations 
    SET crane_id = ${defaultCraneId}
    WHERE crane_id IS NOT NULL 
      AND crane_id NOT IN ('7ad0d658-71a1-49cf-a96d-e38e914fbaa1', 'e487c8cc-b5a5-4c21-a201-68b79212d3ba', 'ee85e94d-8490-4d61-9c42-a4375f6382e6')
  `);
  console.log('Reassigned orphaned reservations to default crane.');

  // 2. Clear or reassign other tables if any exist
  await db.execute(sql`
    DELETE FROM operator_cranes 
    WHERE crane_id NOT IN ('7ad0d658-71a1-49cf-a96d-e38e914fbaa1', 'e487c8cc-b5a5-4c21-a201-68b79212d3ba', 'ee85e94d-8490-4d61-9c42-a4375f6382e6')
  `);

  await db.execute(sql`
    DELETE FROM crane_zone_affinities 
    WHERE crane_id NOT IN ('7ad0d658-71a1-49cf-a96d-e38e914fbaa1', 'e487c8cc-b5a5-4c21-a201-68b79212d3ba', 'ee85e94d-8490-4d61-9c42-a4375f6382e6')
  `);

  await db.execute(sql`
    DELETE FROM crane_operation_log 
    WHERE crane_id NOT IN ('7ad0d658-71a1-49cf-a96d-e38e914fbaa1', 'e487c8cc-b5a5-4c21-a201-68b79212d3ba', 'ee85e94d-8490-4d61-9c42-a4375f6382e6')
  `);

  await db.execute(sql`
    DELETE FROM work_stoppages 
    WHERE crane_id IS NOT NULL 
      AND crane_id NOT IN ('7ad0d658-71a1-49cf-a96d-e38e914fbaa1', 'e487c8cc-b5a5-4c21-a201-68b79212d3ba', 'ee85e94d-8490-4d61-9c42-a4375f6382e6')
  `);

  await db.execute(sql`
    DELETE FROM maintenance_blocks 
    WHERE crane_id NOT IN ('7ad0d658-71a1-49cf-a96d-e38e914fbaa1', 'e487c8cc-b5a5-4c21-a201-68b79212d3ba', 'ee85e94d-8490-4d61-9c42-a4375f6382e6')
  `);

  await db.execute(sql`
    DELETE FROM work_orders 
    WHERE crane_id NOT IN ('7ad0d658-71a1-49cf-a96d-e38e914fbaa1', 'e487c8cc-b5a5-4c21-a201-68b79212d3ba', 'ee85e94d-8490-4d61-9c42-a4375f6382e6')
  `);

  await db.execute(sql`
    UPDATE land_waiting_list 
    SET crane_id = NULL 
    WHERE crane_id IS NOT NULL 
      AND crane_id NOT IN ('7ad0d658-71a1-49cf-a96d-e38e914fbaa1', 'e487c8cc-b5a5-4c21-a201-68b79212d3ba', 'ee85e94d-8490-4d61-9c42-a4375f6382e6')
  `);

  await db.execute(sql`
    UPDATE waiting_list 
    SET crane_id = NULL 
    WHERE crane_id IS NOT NULL 
      AND crane_id NOT IN ('7ad0d658-71a1-49cf-a96d-e38e914fbaa1', 'e487c8cc-b5a5-4c21-a201-68b79212d3ba', 'ee85e94d-8490-4d61-9c42-a4375f6382e6')
  `);

  await db.execute(sql`
    UPDATE waiting_offers 
    SET crane_id = NULL 
    WHERE crane_id IS NOT NULL 
      AND crane_id NOT IN ('7ad0d658-71a1-49cf-a96d-e38e914fbaa1', 'e487c8cc-b5a5-4c21-a201-68b79212d3ba', 'ee85e94d-8490-4d61-9c42-a4375f6382e6')
  `);

  // 3. Delete all cranes NOT IN the 3 valid IDs
  const deleteResult = await db.execute(sql`
    DELETE FROM cranes 
    WHERE id NOT IN ('7ad0d658-71a1-49cf-a96d-e38e914fbaa1', 'e487c8cc-b5a5-4c21-a201-68b79212d3ba', 'ee85e94d-8490-4d61-9c42-a4375f6382e6')
  `);
  console.log('Deleted extraneous cranes:', deleteResult);

  // 4. Ensure the 3 remaining cranes are active
  await db.execute(sql`
    UPDATE cranes 
    SET crane_status = 'active' 
    WHERE id IN ('7ad0d658-71a1-49cf-a96d-e38e914fbaa1', 'e487c8cc-b5a5-4c21-a201-68b79212d3ba', 'ee85e94d-8490-4d61-9c42-a4375f6382e6')
  `);

  // 5. Query remaining cranes to confirm
  const remainingCranes = await db.execute(sql`
    SELECT id, name, type, max_capacity_kn, max_pool_width, crane_status 
    FROM cranes 
    ORDER BY name
  `);
  console.log('REMAINING CRANES (Count = ' + remainingCranes.length + '):');
  console.table(remainingCranes);

  process.exit(0);
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
