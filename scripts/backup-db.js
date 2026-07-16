const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from server/.env");
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

const TABLES_TO_BACKUP = [
  'conversations',
  'conversation_members',
  'messages',
  'user_blocks',
  'profiles'
];

async function fetchTableData(tableName) {
  let allData = [];
  let from = 0;
  const limit = 1000;
  let keepFetching = true;

  console.log(`[Backup] Fetching data from table: ${tableName}...`);

  while (keepFetching) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + limit - 1);

    if (error) {
      console.error(`❌ Error fetching table ${tableName}:`, error.message);
      throw error;
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
      from += limit;
      if (data.length < limit) keepFetching = false;
    } else {
      keepFetching = false;
    }
  }

  console.log(`[Backup] Finished fetching ${allData.length} records from ${tableName}.`);
  return allData;
}

async function runBackup() {
  console.log("=========================================");
  console.log("   INITIATING DATABASE SNAPSHOT BACKUP   ");
  console.log("=========================================");

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../backups', `snapshot-${timestamp}`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const metadata = {
    timestamp: new Date().toISOString(),
    tables: {}
  };

  try {
    for (const table of TABLES_TO_BACKUP) {
      const records = await fetchTableData(table);
      const filePath = path.join(backupDir, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
      metadata.tables[table] = {
        count: records.length,
        file: `${table}.json`
      };
    }

    // Write metadata
    fs.writeFileSync(
      path.join(backupDir, 'metadata.json'), 
      JSON.stringify(metadata, null, 2), 
      'utf8'
    );

    console.log("=========================================");
    console.log(`✅ Backup successfully saved to: ${backupDir}`);
    console.log("=========================================");
  } catch (error) {
    console.error("❌ Backup process failed!", error);
    process.exit(1);
  }
}

runBackup();
