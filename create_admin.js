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

async function run() {
  const email = 'exdevedor@exdevedor.com.br';
  const password = 'admin'; // simple default password
  const role = 'admin';

  // Check if exists
  const { data: existing } = await supabase.from('app_users').select('*').eq('email', email).maybeSingle();
  if (existing) {
    console.log('User already exists, updating role to admin...');
    await supabase.from('app_users').update({ role: 'admin' }).eq('email', email);
  } else {
    console.log('Creating admin user...');
    await supabase.from('app_users').insert({ email, password, phone: '0000', role: 'admin' });
  }
  console.log('Done!');
}
run();
