const fs = require('fs');
const path = require('path');

// Read the fixed HTML from the string below
const fixedHtml = `PASTE_THE_COMPLETE_HTML_HERE`;

// Write it
fs.writeFileSync('E:\\enlightlab-clone\\index.html', fixedHtml, 'utf8');
console.log('✅ Fixed index.html written');