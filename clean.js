import fs from 'fs';

const filename = "c:\\Users\\manel\\OneDrive\\Escritorio\\web AFC\\panel_afcademia\\panel_afclanding\\src\\pages\\Leads.jsx";
let content = fs.readFileSync(filename, 'utf-8');

content = content.replace(/ className="bg-\[#003865\]"/g, '');

fs.writeFileSync(filename, content, 'utf-8');

console.log("Done");
