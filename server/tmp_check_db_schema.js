require('dotenv').config();
const supabase = require("./config/database");

async function checkForeignKeys() {
  try {
    const { data, error } = await supabase.rpc("run_sql_query", {
      query_text: `
        SELECT
            tc.table_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'messages';
      `
    });

    if (error) {
      // If run_sql_query is missing, let's try direct postgres connection or fetch details
      console.log("RPC Error:", error);
      
      // Let's inspect messages columns directly using Supabase API
      const { data: cols, error: colErr } = await supabase
        .from("messages")
        .select("*")
        .limit(1);
      console.log("Sample message columns:", cols ? Object.keys(cols[0] || {}) : colErr);
    } else {
      console.log("FOREIGN KEYS ON 'messages' TABLE:");
      console.log(data);
    }
  } catch (err) {
    console.error("Fatal:", err);
  }
}

checkForeignKeys();
