// generate-markdown.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const resultsPath = path.join(__dirname, 'all_working_proxies.txt');
  const rawContent = fs.readFileSync(resultsPath, 'utf-8');

  const proxies = rawContent
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line));

  let markdownContent = `# ✅ Working Proxies (Port 443)\n\n`;
  markdownContent += `*Last updated on: ${new Date().toUTCString()}*\n`;
  markdownContent += `*Total working proxies found: ${proxies.length}*\n\n`;

  if (proxies.length > 0) {
    // --- New Detailed Table with Metadata ---
    markdownContent += `| IP Address | ISP / Organization | Location |\n`;
    markdownContent += `|------------|--------------------|----------|\n`;

    proxies.sort((a, b) => (a.ip || '').localeCompare(b.ip || ''));

    proxies.forEach(proxy => {
      const ip = proxy.ip || 'N/A';
      const isp = proxy.as || 'N/A';
      const location = `${proxy.city || 'N/A'}, ${proxy.country || 'N/A'}`;
      markdownContent += `| \`${ip}\` | ${isp} | ${location} |\n`;
    });

    // --- Updated Copy-Paste List (IPs only) ---
    markdownContent += `\n### Copy-Paste List (IPs Only)\n`;
    markdownContent += '```\n';
    markdownContent += proxies.map(p => p.ip).join('\n');
    markdownContent += '\n```\n';
  } else {
    markdownContent += `No working proxies were found in this run.\n`;
  }

  fs.writeFileSync('WORKING_PROXIES.md', markdownContent);
  console.log(`Successfully generated WORKING_PROXIES.md with ${proxies.length} proxies.`);
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('No partial results found. Generating an empty markdown file.');
    fs.writeFileSync(
      'WORKING_PROXIES.md',
      `# ✅ Working Proxies\n\n*Last updated on: ${new Date().toUTCString()}*\n\nNo working proxies were found in this run.\n`
    );
  } else {
    console.error('An error occurred in generate-markdown.js:', error);
    process.exit(1);
  }
}
