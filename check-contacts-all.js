require('dotenv').config();
async function check() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?order=created_at.desc&limit=5`, {
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
    }
  });
  
  const data = await res.json();
  console.log('Latest 5 Contacts:');
  console.log(data);
}
check();
