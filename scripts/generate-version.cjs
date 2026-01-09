const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const versionFilePath = path.join(__dirname, '..', 'public', 'version.json');
const nextContent = `${JSON.stringify({ version: packageJson.version }, null, 2)}\n`;

let currentContent = '';
if (fs.existsSync(versionFilePath)) {
  currentContent = fs.readFileSync(versionFilePath, 'utf8');
}

if (currentContent !== nextContent) {
  fs.writeFileSync(versionFilePath, nextContent, 'utf8');
}
