require('dotenv').config();
const fs = require('fs');
async function check() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/?apikey=${process.env.SUPABASE_ANON_KEY}`);
  const data = await res.text();
  fs.writeFileSync('openapi.json', data);
  console.log('Saved openapi.json');
}
check();
