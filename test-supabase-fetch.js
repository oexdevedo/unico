require('dotenv').config();
async function test() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ name: 'Test User', whatsapp: '5511999999999' })
  });
  const data = await res.text();
  console.log('Status:', res.status, res.statusText);
  console.log('Response:', data);
}
test();
