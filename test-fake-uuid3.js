require('dotenv').config();
const crypto = require('crypto');
async function test() {
  const fakeUserId = crypto.randomUUID();
  
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ 
      name: 'Test Fake UUID 3', 
      full_name: 'Test Fake UUID 3',
      whatsapp: '5511999999996', 
      user_id: fakeUserId,
      account_id: 'a33e877a-cd55-4497-b5e2-542cc543d41c', // existing
      role: 'user',
      account_role: 'owner'
    })
  });
  const data = await res.text();
  console.log('Status:', res.status, res.statusText);
  console.log('Response:', data);
}
test();
