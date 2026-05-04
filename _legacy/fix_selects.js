const fs = require('fs');
let c = fs.readFileSync('src/pages/Leads.jsx', 'utf8');
fs.writeFileSync('src/pages/Leads.jsx', c.replace(/ className="bg-\[#003865\]"/g, ''));
console.log('Fixed');
