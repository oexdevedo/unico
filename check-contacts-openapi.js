require('dotenv').config();
async function check() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/?apikey=${process.env.SUPABASE_ANON_KEY}`);
  const data = await res.json();
  const paths = data.paths;
  if (paths['/contacts']) {
    console.log('Contacts path exists.');
    // get definitions ref
    const schemaRef = paths['/contacts'].get.responses['200'].schema.items.$ref;
    const defName = schemaRef.split('/').pop();
    console.log('Definition name:', defName);
    console.log('Schema:', data.definitions[defName]);
  } else {
    console.log('No /contacts path found');
  }
}
check();
