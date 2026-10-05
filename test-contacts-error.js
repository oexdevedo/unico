const http = require('http');

const options = {
  hostname: 'localhost',
  port: 4444,
  path: '/api/contacts',
  method: 'GET',
  headers: {
    'Cookie': 'auth-token=' + Buffer.from('exdevedor@exdevedor.com.br').toString('base64')
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, data));
});
req.on('error', e => console.error(e));
req.end();
