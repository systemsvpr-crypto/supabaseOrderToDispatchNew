import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkColumns() {
  const { data, error } = await supabase.from('app_orders').select('*').limit(1);
  if (error) {
    console.error(error);
  } else {
    console.log('Columns in app_orders:', Object.keys(data[0] || {}));
  }
}

checkColumns();
