import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const resultsPath = path.join(__dirname, 'all_working_proxies.txt');
  const rawContent = fs.readFileSync(resultsPath, 'utf-8');

  const proxies = [...new Set(rawContent.split(/\r?\n/).filter(line => line.trim() !== ''))];

  let markdownContent = `# ✅ Working Proxies\n\n`;
  markdownContent += `*Last updated on: ${new Date().toUTCString()}*\n`;
  markdownContent += `*Total working proxies found: ${proxies.length}*\n\n`;

  if (proxies.length > 0) {
    markdownContent += `| Proxy IP             |\n`;
    markdownContent += `|----------------------|\n`;
    proxies.sort(); // Sort IPs alphabetically
    proxies.forEach(proxy => {
      markdownContent += `| \`${proxy}\` |\n`;
    });
    markdownContent += `\n### Copy-Paste List\n`;
    markdownContent += '```\n';
    markdownContent += proxies.join('\n');
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
