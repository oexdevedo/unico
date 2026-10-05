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

async function migrate() {
  const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
  for (const u of users) {
    const { data, error } = await supabase.from('app_users').insert({
      email: u.email,
      phone: u.phone,
      password: u.password
    });
    if (error) console.log(`Erro ao inserir ${u.email}:`, error.message);
    else console.log(`Sucesso ao inserir ${u.email}`);
  }
}
migrate();
