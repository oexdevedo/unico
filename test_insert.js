const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const ws = require('ws');

const envVars = fs.readFileSync('.env', 'utf8').split('\n');
let supabaseUrl = '';
let supabaseKey = '';

envVars.forEach(line => {
  if (line.startsWith('SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
});

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function test() {
  const { data, error } = await supabase.from('app_users').insert({ email: 'test_insert@yahoo.com', phone: '123', password: '123' }).select();
  console.log('Error:', error);
  console.log('Data:', data);
}

test();
