require('dotenv').config();
async function test() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?limit=1`, {
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json();
  console.log('Response:', data);
}
test();
