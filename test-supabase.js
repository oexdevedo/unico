require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('profiles').insert([{ name: 'Test', whatsapp: '123' }]);
  console.log('Result:', { data, error });
}
test();
