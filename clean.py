import sys

filename = r"c:\Users\manel\OneDrive\Escritorio\web AFC\panel_afcademia\panel_afclanding\src\pages\Leads.jsx"
with open(filename, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(' className="bg-[#003865]"', '')

with open(filename, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
