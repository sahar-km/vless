import { connect } from 'cloudflare:sockets';
let temporaryTOKEN, permanentTOKEN;

export default {
  async fetch(request, env, ctx) {
    const websiteIcon = env.ICO;
    const url = new URL(request.url);
    const UA = request.headers.get('User-Agent') || 'null';
    const path = url.pathname;
    const hostname = url.hostname;
    const currentDate = new Date();
    const timestamp = Math.ceil(currentDate.getTime() / (1000 * 60 * 31));
    temporaryTOKEN = await doubleHash(url.hostname + timestamp + UA);
    permanentTOKEN = env.TOKEN || temporaryTOKEN;

    // Get Scamalytics credentials from environment variables
    const scamalyticsUsername = env.SCAMALYTICS_USERNAME;
    const scamalyticsApiKey = env.SCAMALYTICS_API_KEY;
    const scamalyticsApiBaseUrl =
      env.SCAMALYTICS_API_BASE_URL || 'https://api12.scamalytics.com/v3/';

    if (path.toLowerCase() === '/check') {
      if (!url.searchParams.has('proxyip'))
        return new Response('Missing proxyip parameter', { status: 400 });
      if (url.searchParams.get('proxyip') === '')
        return new Response('Invalid proxyip parameter', { status: 400 });
      if (env.TOKEN) {
        if (!url.searchParams.has('token') || url.searchParams.get('token') !== permanentTOKEN) {
          return new Response(
            JSON.stringify(
              {
                status: 'error',
                message: `ProxyIP Check Failed: Invalid TOKEN`,
                timestamp: new Date().toISOString(),
              },
              null,
              4,
            ),
            {
              status: 403,
              headers: {
                'content-type': 'application/json; charset=UTF-8',
                'Access-Control-Allow-Origin': '*',
              },
            },
          );
        }
      }
      const proxyIPInput = url.searchParams.get('proxyip').toLowerCase();
      const result = await CheckProxyIP(proxyIPInput);

      return new Response(JSON.stringify(result, null, 2), {
        status: result.success ? 200 : 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else if (path.toLowerCase() === '/scamalytics-lookup') {
      if (
        !url.searchParams.has('token') ||
        (url.searchParams.get('token') !== temporaryTOKEN &&
          url.searchParams.get('token') !== permanentTOKEN)
      ) {
        return new Response(
          JSON.stringify(
            {
              status: 'error',
              message: `Scamalytics Lookup Failed: Invalid TOKEN`,
              timestamp: new Date().toISOString(),
            },
            null,
            4,
          ),
          {
            status: 403,
            headers: {
              'content-type': 'application/json; charset=UTF-8',
              'Access-Control-Allow-Origin': '*',
            },
          },
        );
      }

      const ipToLookup = url.searchParams.get('ip');
      if (!ipToLookup) {
        return new Response(JSON.stringify({ error: 'Missing IP parameter' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Check if Scamalytics credentials are configured
      if (!scamalyticsUsername || !scamalyticsApiKey) {
        return new Response(
          JSON.stringify({
            error: 'Scamalytics API credentials not configured on server.',
            message:
              'Please set SCAMALYTICS_USERNAME and SCAMALYTICS_API_KEY environment variables.',
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          },
        );
      }

      const cleanIP = ipToLookup.replace(/[\[\]]/g, '');
      const scamalyticsUrl = `${scamalyticsApiBaseUrl}${scamalyticsUsername}/?key=${scamalyticsApiKey}&ip=${cleanIP}`;

      console.log('Scamalytics URL:', scamalyticsUrl);

      try {
        const scamalyticsResponse = await fetch(scamalyticsUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ProxyIPScanner/1.0)',
          },
        });

        console.log('Scamalytics Response Status:', scamalyticsResponse.status);

        if (!scamalyticsResponse.ok) {
          throw new Error(`HTTP ${scamalyticsResponse.status}: ${scamalyticsResponse.statusText}`);
        }

        const responseText = await scamalyticsResponse.text();
        console.log('Scamalytics Raw Response:', responseText.substring(0, 200));

        let responseBody;
        try {
          responseBody = JSON.parse(responseText);
        } catch (parseError) {
          console.error('JSON Parse Error:', parseError);
          return new Response(
            JSON.stringify({
              error: 'Invalid JSON response from Scamalytics API',
              details: `Response was not valid JSON: ${responseText.substring(0, 100)}...`,
            }),
            {
              status: 502,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            },
          );
        }

        return new Response(JSON.stringify(responseBody), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        console.error('Scamalytics API Error:', error);
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch from Scamalytics API',
            details: error.message,
          }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          },
        );
      }
    } else if (path.toLowerCase() === '/resolve') {
      if (
        !url.searchParams.has('token') ||
        (url.searchParams.get('token') !== temporaryTOKEN &&
          url.searchParams.get('token') !== permanentTOKEN)
      ) {
        return new Response(
          JSON.stringify(
            {
              status: 'error',
              message: `Domain Resolve Failed: Invalid TOKEN`,
              timestamp: new Date().toISOString(),
            },
            null,
            4,
          ),
          {
            status: 403,
            headers: {
              'content-type': 'application/json; charset=UTF-8',
              'Access-Control-Allow-Origin': '*',
            },
          },
        );
      }
      if (!url.searchParams.has('domain'))
        return new Response('Missing domain parameter', { status: 400 });
      const domain = url.searchParams.get('domain');

      try {
        const ips = await resolveDomain(domain);
        return new Response(JSON.stringify({ success: true, domain, ips }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } else if (path.toLowerCase() === '/ip-info') {
      if (
        !url.searchParams.has('token') ||
        (url.searchParams.get('token') !== temporaryTOKEN &&
          url.searchParams.get('token') !== permanentTOKEN)
      ) {
        return new Response(
          JSON.stringify(
            {
              status: 'error',
              message: `IP Info Failed: Invalid TOKEN`,
              timestamp: new Date().toISOString(),
            },
            null,
            4,
          ),
          {
            status: 403,
            headers: {
              'content-type': 'application/json; charset=UTF-8',
              'Access-Control-Allow-Origin': '*',
            },
          },
        );
      }
      let ip = url.searchParams.get('ip') || request.headers.get('CF-Connecting-IP');
      if (!ip) {
        return new Response(
          JSON.stringify(
            {
              status: 'error',
              message: 'IP parameter not provided',
              code: 'MISSING_PARAMETER',
              timestamp: new Date().toISOString(),
            },
            null,
            4,
          ),
          {
            status: 400,
            headers: {
              'content-type': 'application/json; charset=UTF-8',
              'Access-Control-Allow-Origin': '*',
            },
          },
        );
      }

      if (ip.includes('[')) {
        ip = ip.replace('[', '').replace(']', '');
      }

      try {
        const response = await fetch(`http://ip-api.com/json/${ip}?lang=en`);
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        const data = await response.json();
        data.timestamp = new Date().toISOString();
        return new Response(JSON.stringify(data, null, 4), {
          headers: {
            'content-type': 'application/json; charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        console.error('IP Info Fetch Error:', error);
        return new Response(
          JSON.stringify(
            {
              status: 'error',
              message: `IP Info Fetch Error: ${error.message}`,
              code: 'API_REQUEST_FAILED',
              query: ip,
              timestamp: new Date().toISOString(),
              details: {
                errorType: error.name,
                stack: error.stack ? error.stack.split('\n')[0] : null,
              },
            },
            null,
            4,
          ),
          {
            status: 500,
            headers: {
              'content-type': 'application/json; charset=UTF-8',
              'Access-Control-Allow-Origin': '*',
            },
          },
        );
      }
    } else {
      const envKey = env.URL302 ? 'URL302' : env.URL ? 'URL' : null;
      if (envKey) {
        const URLs = await sanitizeURLs(env[envKey]);
        const URL = URLs[Math.floor(Math.random() * URLs.length)];
        return envKey === 'URL302' ? Response.redirect(URL, 302) : fetch(new Request(URL, request));
      } else if (env.TOKEN) {
        return new Response(await nginxWelcomePage(), {
          headers: {
            'Content-Type': 'text/html; charset=UTF-8',
          },
        });
      } else if (path.toLowerCase() === '/favicon.ico') {
        return Response.redirect(websiteIcon, 302);
      }
      return await generateHTMLPage(hostname, websiteIcon, temporaryTOKEN);
    }
  },
};

async function resolveDomain(domain) {
  domain = domain.includes(':') ? domain.split(':')[0] : domain;
  try {
    const [ipv4Response, ipv6Response] = await Promise.all([
      fetch(`https://1.1.1.1/dns-query?name=${domain}&type=A`, {
        headers: { Accept: 'application/dns-json' },
      }),
      fetch(`https://1.1.1.1/dns-query?name=${domain}&type=AAAA`, {
        headers: { Accept: 'application/dns-json' },
      }),
    ]);
    const [ipv4Data, ipv6Data] = await Promise.all([ipv4Response.json(), ipv6Response.json()]);

    const ips = [];
    if (ipv4Data.Answer) {
      const ipv4Addresses = ipv4Data.Answer.filter(record => record.type === 1).map(
        record => record.data,
      );
      ips.push(...ipv4Addresses);
    }
    if (ipv6Data.Answer) {
      const ipv6Addresses = ipv6Data.Answer.filter(record => record.type === 28).map(
        record => `[${record.data}]`,
      );
      ips.push(...ipv6Addresses);
    }
    if (ips.length === 0) {
      throw new Error('No A or AAAA records found');
    }
    return ips;
  } catch (error) {
    throw new Error(`DNS resolution failed: ${error.message}`);
  }
}

async function CheckProxyIP(proxyIP) {
  let portRemote = 443;
  let hostToCheck = proxyIP;
  if (proxyIP.includes('.tp')) {
    const portMatch = proxyIP.match(/\.tp(\d+)\./);
    if (portMatch) portRemote = parseInt(portMatch[1]);
    hostToCheck = proxyIP.split('.tp')[0];
  } else if (proxyIP.includes('[') && proxyIP.includes(']:')) {
    portRemote = parseInt(proxyIP.split(']:')[1]);
    hostToCheck = proxyIP.split(']:')[0] + ']';
  } else if (proxyIP.includes(':') && !proxyIP.startsWith('[')) {
    const parts = proxyIP.split(':');
    if (parts.length === 2 && parts[0].includes('.')) {
      hostToCheck = parts[0];
      portRemote = parseInt(parts[1]) || 443;
    }
  }

  const tcpSocket = connect({
    hostname: hostToCheck,
    port: portRemote,
  });
  try {
    const httpRequest =
      'GET /cdn-cgi/trace HTTP/1.1\r\n' +
      'Host: speed.cloudflare.com\r\n' +
      'User-Agent: checkip/diana/\r\n' +
      'Connection: close\r\n\r\n';
    const writer = tcpSocket.writable.getWriter();
    await writer.write(new TextEncoder().encode(httpRequest));
    writer.releaseLock();

    const reader = tcpSocket.readable.getReader();
    let responseData = new Uint8Array(0);
    while (true) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise(resolve => setTimeout(() => resolve({ done: true }), 5000)),
      ]);
      if (done) break;
      if (value) {
        const newData = new Uint8Array(responseData.length + value.length);
        newData.set(responseData);
        newData.set(value, responseData.length);
        responseData = newData;
        const responseText = new TextDecoder().decode(responseData);
        if (
          responseText.includes('\r\n\r\n') &&
          (responseText.includes('Connection: close') || responseText.includes('content-length'))
        ) {
          break;
        }
      }
    }
    reader.releaseLock();

    const responseText = new TextDecoder().decode(responseData);
    const statusMatch = responseText.match(/^HTTP\/\d\.\d\s+(\d+)/i);
    const statusCode = statusMatch ? parseInt(statusMatch[1]) : null;
    function isValidProxyResponse(responseText, responseData) {
      const statusMatch = responseText.match(/^HTTP\/\d\.\d\s+(\d+)/i);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : null;
      const looksLikeCloudflare = responseText.includes('cloudflare');
      const isExpectedError =
        responseText.includes('plain HTTP request') || responseText.includes('400 Bad Request');
      const hasBody = responseData.length > 100;
      return statusCode !== null && looksLikeCloudflare && isExpectedError && hasBody;
    }
    const isSuccessful = isValidProxyResponse(responseText, responseData);

    const jsonResponse = {
      success: isSuccessful,
      proxyIP: hostToCheck,
      portRemote: portRemote,
      statusCode: statusCode || null,
      responseSize: responseData.length,
      timestamp: new Date().toISOString(),
    };
    await tcpSocket.close();
    return jsonResponse;
  } catch (error) {
    return {
      success: false,
      proxyIP: hostToCheck,
      portRemote: portRemote,
      timestamp: new Date().toISOString(),
      error: error.message || error.toString(),
    };
  }
}

async function sanitizeURLs(content) {
  var replacedContent = content.replace(/[\r\n]+/g, '|').replace(/\|+/g, '|');
  const addressArray = replacedContent.split('|');
  const sanitizedArray = addressArray.filter((item, index) => {
    return item !== '' && addressArray.indexOf(item) === index;
  });
  return sanitizedArray;
}

async function doubleHash(text) {
  const encoder = new TextEncoder();
  const firstHash = await crypto.subtle.digest('MD5', encoder.encode(text));
  const firstHashArray = Array.from(new Uint8Array(firstHash));
  const firstHex = firstHashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
  const secondHash = await crypto.subtle.digest('MD5', encoder.encode(firstHex.slice(7, 27)));
  const secondHashArray = Array.from(new Uint8Array(secondHash));
  const secondHex = secondHashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
  return secondHex.toLowerCase();
}

async function nginxWelcomePage() {
  const text = `
    <!DOCTYPE html>
    <html>
    <head>
    <title>Welcome to nginx</title>
    <style>
        body {
            width: 35em;
            margin: 0 auto;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
    </style>
    </head>
    <body>
    <h1>Welcome to nginx</h1>
    <p>If you see this page, the nginx web server is successfully installed and
    working. Further configuration is required.</p>
    <p>For online documentation and support please refer to
    <a href="http://nginx.org/">nginx.org</a>.<br/>
    Commercial support is available at
    <a href="http://nginx.com/">nginx.com</a>.</p>
    <p><em>Thank you for using nginx.</em></p>
    </body>
    </html>
    `;
  return text;
}

async function generateHTMLPage(hostname, websiteIcon, token) {
  const html = `
<!DOCTYPE html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ProxyIP Checker- Advanced Risk Analysis</title>
    <link rel="icon" href="${websiteIcon}" type="image/x-icon" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap"
      rel="stylesheet"
    />
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      @font-face {
        font-family: "Styrene B LC";
        src: url("https://pub-7a3b428c76aa411181a0f4dd7fa9064b.r2.dev/StyreneBLC-Regular.woff2")
          format("woff2");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Styrene B LC";
        src: url("https://pub-7a3b428c76aa411181a0f4dd7fa9064b.r2.dev/StyreneBLC-Medium.woff2")
          format("woff2");
        font-weight: 500;
        font-style: normal;
        font-display: swap;
      }

      :root {
        --bg-primary: #0a0a0a;
        --bg-secondary: #1a1a1a;
        --bg-tertiary: #2a2a2a;
        --text-primary: #ffffff;
        --text-secondary: #b0b0b0;
        --text-muted: #666666;
        --accent-orange: #ff6b35;
        --accent-orange-dark: #e55a2b;
        --accent-orange-light: #ff8c5a;
        --border-color: #333333;
        --border-light: #444444;
        --success-color: #10b981;
        --success-bg: rgba(16, 185, 129, 0.1);
        --success-border: rgba(16, 185, 129, 0.3);
        --error-color: #ef4444;
        --error-bg: rgba(239, 68, 68, 0.1);
        --error-border: rgba(239, 68, 68, 0.3);
        --warning-color: #f59e0b;
        --warning-bg: rgba(245, 158, 11, 0.1);
        --warning-border: rgba(245, 158, 11, 0.3);
        --info-color: #3b82f6;
        --info-bg: rgba(59, 130, 246, 0.1);
        --info-border: rgba(59, 130, 246, 0.3);
        --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.1);
        --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
        --shadow-lg: 0 8px 25px rgba(0, 0, 0, 0.25);
        --shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.4);
        --radius-sm: 8px;
        --radius-md: 12px;
        --radius-lg: 16px;
        --radius-xl: 20px;

        --sans: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
        --mono-sans: "Styrene B LC", monospace;
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: var(--sans);
        background: linear-gradient(135deg, var(--bg-primary) 0%, #1a1a1a 100%);
        color: var(--text-primary);
        line-height: 1.6;
        min-height: 100vh;
        overflow-x: hidden;
      }

      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem;
      }

      .header {
        text-align: center;
        margin-bottom: 3rem;
        position: relative;
        display: flex; /* MODIFIED */
        justify-content: center; /* MODIFIED */
        align-items: center; /* MODIFIED */
        gap: 0.75rem; /* MODIFIED */
      }

      /* NEW: Terminal Icon Style */
      .header-icon {
        font-family: var(--mono-sans);
        font-size: clamp(2rem, 4vw, 2.5rem);
        font-weight: 700;
        color: var(--accent-orange-light);
        background: var(--bg-tertiary);
        padding: 0.25rem 0.75rem;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
        line-height: 1;
      }

      .header::before {
        content: "";
        position: absolute;
        top: -50px;
        left: 50%;
        transform: translateX(-50%);
        width: 200px;
        height: 200px;
        background: radial-gradient(
          circle,
          var(--accent-orange) 0%,
          transparent 70%
        );
        opacity: 0.1;
        border-radius: 50%;
        z-index: -1;
      }

      .main-title {
        font-size: clamp(2.5rem, 5vw, 3rem);
        font-weight: 701;
        background: linear-gradient(
          135deg,
          var(--accent-orange) 0%,
          var(--accent-orange-light) 100%
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-bottom: 0; /* MODIFIED */
        text-shadow: 0 0 30px rgba(255, 107, 53, 0.3);
      }

      .subtitle {
        font-family: var(--mono-sans);
        font-size: 1rem;
        color: var(--text-secondary);
        font-weight: 400;
        /* margin-bottom: 0.5rem; */ /* MODIFIED: Handled by header gap */
        text-align: center;
        width: 100%; /* To make it span full width below title */
      }
      
      /* MODIFIED: Wrapper for title and subtitle */
      .title-group {
        display: flex;
        flex-direction: column;
        align-items: center;
      }


      .main-card {
        background: linear-gradient(145deg, var(--bg-secondary) 0%, #1f1f1f 100%);
        border-radius: var(--radius-xl);
        padding: 3rem;
        box-shadow: var(--shadow-xl);
        border: 1px solid var(--border-color);
        backdrop-filter: blur(10px);
        position: relative;
        overflow: hidden;
      }

      .main-card::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(
          90deg,
          transparent,
          var(--accent-orange),
          transparent
        );
        opacity: 0.5;
      }

      .form-section {
        display: grid;
        gap: 2rem;
        margin-bottom: 2rem;
      }

      .input-group {
        position: relative;
      }

      .input-label {
        display: flex; /* MODIFIED */
        align-items: center; /* MODIFIED */
        gap: 0.5rem; /* MODIFIED */
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 0.75rem;
        font-size: 1.1rem;
      }

      /* NEW: Style for SVG icons */
      .input-label svg {
        width: 20px;
        height: 20px;
        color: var(--accent-orange-light);
      }

      .input-wrapper {
        position: relative;
      }

      .form-input {
        width: 100%;
        padding: 1rem 1.25rem;
        font-family: var(--mono-sans);
        font-size: 1rem;
        background: var(--bg-tertiary);
        border: 2px solid var(--border-color);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        transition: all 0.3s ease;
        outline: none;
      }

      .form-input:focus {
        border-color: var(--accent-orange);
        box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
        transform: translateY(-1px);
      }

      .form-input::placeholder {
        color: var(--text-muted);
      }

      .btn-primary {
        background: linear-gradient(
          135deg,
          var(--accent-orange) 0%,
          var(--accent-orange-dark) 100%
        );
        color: rgb(255, 255, 255);
        border: none;
        padding: 0.9rem 2rem;
        border-radius: var(--radius-md);
        font-size: 1.1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: var(--shadow-md);
      }

      .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg);
      }

      .btn-primary:active {
        transform: translateY(0);
      }

      .btn-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }

      .btn-primary::before {
        content: "";
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255, 255, 255, 0.2),
          transparent
        );
        transition: left 0.5s;
      }

      .btn-primary:hover::before {
        left: 100%;
      }

      .loading-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top: 2px solid white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-left: 0.5rem;
        display: none;
      }

      @keyframes spin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }

      .results-section {
        margin-top: 3rem;
      }

      .result-card {
        font-family: var(--mono-sans);
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        padding: 2rem;
        margin-bottom: 1.5rem;
        border-left: 4px solid var(--border-color);
        box-shadow: var(--shadow-md);
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
      }

      .result-card::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        background: var(--border-color);
        transition: all 0.3s ease;
      }

      .result-card.success {
        border-left-color: var(--success-color);
        background: linear-gradient(
          145deg,
          var(--success-bg),
          var(--bg-secondary)
        );
      }
      .result-card.success::before {
        background: var(--success-color);
      }
      .result-card.error {
        border-left-color: var(--error-color);
        background: linear-gradient(
          145deg,
          var(--error-bg),
          var(--bg-secondary)
        );
      }
      .result-card.error::before {
        background: var(--error-color);
      }
      .result-card.warning {
        border-left-color: var(--warning-color);
        background: linear-gradient(
          145deg,
          var(--warning-bg),
          var(--bg-secondary)
        );
      }
      .result-card.warning::before {
        background: var(--warning-color);
      }

      .result-header {
        display: flex;
        align-items: center;
        margin-bottom: 1.5rem;
        gap: 0.75rem;
      }

      .result-title {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary);
      }

      .result-content {
        display: grid;
        gap: 1rem;
      }

      /* MODIFIED: Improved result item styling */
      .result-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        background: rgba(255, 255, 255, 0.02);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-light);
        transition: background 0.2s;
      }
      .result-item:hover {
        background: rgba(255, 255, 255, 0.05);
      }
      .result-label {
        font-weight: 500;
        color: var(--text-secondary);
      }
      .result-value {
        font-weight: 600;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      /* END MODIFICATION */


      .badge {
        display: inline-flex;
        align-items: center;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.025em;
      }
      .badge.success {
        background: var(--success-bg);
        color: var(--success-color);
        border: 1px solid var(--success-border);
      }
      .badge.error {
        background: var(--error-bg);
        color: var(--error-color);
        border: 1px solid var(--error-border);
      }
      .badge.warning {
        background: var(--warning-bg);
        color: var(--warning-color);
        border: 1px solid var(--warning-border);
      }
      .badge.info {
        background: var(--info-bg);
        color: var(--info-color);
        border: 1px solid var(--info-border);
      }

      .copy-btn {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        padding: 0.25rem 0.5rem;
        border-radius: var(--radius-sm);
        font-size: 0.75rem;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .copy-btn:hover {
        background: var(--accent-orange);
        color: white;
        border-color: var(--accent-orange);
      }

      .toast {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: var(--bg-secondary);
        color: var(--text-primary);
        padding: 1rem 1.5rem;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        border: 1px solid var(--border-color);
        z-index: 1000;
        opacity: 0;
        transform: translateY(100px);
        transition: all 0.3s ease;
      }
      .toast.show {
        opacity: 1;
        transform: translateY(0);
      }
      
      /* MODIFIED: API Docs section completely restyled */
      .api-docs {
        margin-top: 3rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        padding: 2.5rem;
        border: 1px solid var(--border-color);
      }

      .api-docs-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 2rem;
      }
      
      .api-docs-header h3 {
        color: var(--text-primary);
        font-size: 1.75rem;
        font-weight: 700;
      }
      
      .api-docs-header svg {
        width: 28px;
        height: 28px;
        color: var(--accent-orange);
      }

      .api-endpoints {
        display: grid;
        gap: 1rem;
      }

      .api-endpoint {
        display: flex;
        align-items: center;
        gap: 1rem;
        background-color: var(--bg-tertiary);
        padding: 1rem 1.5rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-light);
        transition: all 0.2s ease;
      }
      .api-endpoint:hover {
        border-color: var(--accent-orange);
        transform: translateY(-2px);
      }

      .api-method {
        font-family: var(--mono-sans);
        font-weight: 700;
        padding: 0.25rem 0.75rem;
        border-radius: var(--radius-sm);
        font-size: 0.9rem;
        background-color: var(--success-bg);
        color: var(--success-color);
        border: 1px solid var(--success-border);
      }

      .api-endpoint code {
        font-family: var(--mono-sans);
        font-size: 1rem;
        color: var(--text-secondary);
        flex-grow: 1;
      }

      .api-endpoint code span {
        color: var(--accent-orange-light);
      }

      .api-description {
        font-size: 0.9rem;
        color: var(--text-muted);
        margin-left: auto;
        white-space: nowrap;
      }
      /* END MODIFICATION */


      .footer {
        font-family: var(--mono-sans);
        text-align: center;
        margin-top: 3rem;
        padding: 2rem;
        color: var(--text-muted);
        border-top: 1px solid var(--border-color);
      }
      .footer a {
        color: var(--accent-orange);
        text-decoration: none;
      }
      .footer a:hover {
        text-decoration: underline;
      }

      @media (max-width: 768px) {
        .container {
          padding: 1rem;
        }
        .main-card {
          padding: 2rem;
        }
        .header {
          flex-direction: column; /* Stack icon and title on small screens */
          gap: 1rem;
        }
        .result-item {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.5rem;
        }
        .api-endpoint {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .api-description {
            margin-left: 0;
            margin-top: 0.5rem;
        }
        .toast {
          left: 1rem;
          right: 1rem;
          bottom: 1rem;
        }
      }

      .grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem; /* Increased gap */
      }

      @media (max-width: 640px) {
        .grid-2 {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 480px) {
        .main-card {
          padding: 1.5rem;
        }
        .main-title {
          font-size: 2.2rem;
        }
        .subtitle {
          font-size: 0.9rem;
        }
        .btn-primary {
          font-size: 1rem;
        }
        .api-docs {
          padding: 1.5rem;
        }
        .api-docs-header h3 {
          font-size: 1.5rem;
        }
        .api-endpoint code {
          font-size: 0.9rem;
        }
        .input-label {
          font-size: 1rem;
        }
        .form-input {
          padding: 0.8rem 1rem;
        }
      }

      .flex-center {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem; /* Increased gap */
      }
      .flex-center svg {
        width: 22px; /* Set icon size in button */
        height: 22px;
      }

      .range-results {
        margin-top: 2rem;
      }
      .chart-container {
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
        padding: 1.5rem;
        margin-top: 1rem;
      }
      .ip-grid {
        display: grid;
        gap: 0.5rem;
        max-height: 300px;
        overflow-y: auto;
        padding: 1rem;
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
      }
      .ip-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-light);
        transition: all 0.2s ease;
      }
      .ip-item:hover {
        background: rgba(255, 107, 53, 0.05);
        border-color: var(--accent-orange);
      }
      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 0.5rem;
      }
      .status-indicator.success {
        background: var(--success-color);
        box-shadow: 0 0 8px var(--success-color);
      }
      .status-indicator.error {
        background: var(--error-color);
        box-shadow: 0 0 8px var(--error-color);
      }
      .status-indicator.warning {
        background: var(--warning-color);
        box-shadow: 0 0 8px var(--warning-color);
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header class="header">
        <span class="header-icon">&gt;_</span>
        <div class="title-group">
            <h1 class="main-title">ProxyIP Checker</h1>
            <p class="subtitle">Advanced ProxyIP Verification & Risk Analysis</p>
        </div>
      </header>

      <div class="main-card">
        <div class="form-section">
          <div class="grid-2">
            <div class="input-group">
              <label for="proxyip" class="input-label">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" />
                </svg>
                Single IP / Domain
              </label>
              <div class="input-wrapper">
                <input
                  type="text"
                  id="proxyip"
                  class="form-input"
                  placeholder="127.0.0.1:443 or nima.nscl.ir"
                  autocomplete="off"
                />
              </div>
            </div>

            <div class="input-group">
              <label for="proxyipRange" class="input-label">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 1.5m1-1.5l1 1.5m0 0l.5 1.5m-2-3l2 3m4.5-3l-1.5 2.25m-1.5-2.25l1.5 2.25m3-3l-1.5 2.25m1.5-2.25l1.5 2.25M9 12l-1.5 2.25M15 12l1.5 2.25" />
                </svg>
                IP Range
              </label>
              <div class="input-wrapper">
                <input
                  type="text"
                  id="proxyipRange"
                  class="form-input"
                  placeholder="127.0.0.0/24 OR 127.0.0.1-255"
                  autocomplete="off"
                />
              </div>
            </div>
          </div>

          <button id="checkBtn" class="btn-primary" onclick="checkInputs()">
            <span class="flex-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.562L16.25 22.5l-.648-1.938a2.25 2.25 0 01-1.423-1.423L12 18.75l1.938-.648a2.25 2.25 0 011.423-1.423L17.25 15l.648 1.938a2.25 2.25 0 011.423 1.423L21.25 18.75l-1.938.648a2.25 2.25 0 01-1.423 1.423z" />
              </svg>
              <span class="btn-text">Start Analysis</span>
              <span class="loading-spinner"></span>
            </span>
          </button>
        </div>

        <div id="result" class="results-section"></div>
        <div id="rangeResult" class="range-results" style="display: none"></div>
      </div>

      <div class="api-docs">
        <div class="api-docs-header">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          <h3>API Documentation</h3>
        </div>
        <div class="api-endpoints">
          <div class="api-endpoint">
            <span class="api-method">GET</span>
            <code>/check?proxyip=<span>IP1,IP2,...</span></code>
            <span class="api-description">Check multiple IPs</span>
          </div>
          <div class="api-endpoint">
            <span class="api-method">GET</span>
            <code>/check?iprange=<span>IP_RANGE</span></code>
            <span class="api-description">Check an IP range</span>
          </div>
          <div class="api-endpoint">
            <span class="api-method">GET</span>
            <code>/resolve?domain=<span>YOUR_DOMAIN</span></code>
            <span class="api-description">Resolve domain to IP</span>
          </div>
          <div class="api-endpoint">
            <span class="api-method">GET</span>
            <code>/ip-info?ip=<span>TARGET_IP</span></code>
            <span class="api-description">Get IP information</span>
          </div>
          <div class="api-endpoint">
            <span class="api-method">GET</span>
            <code>/scamalytics-lookup?ip=<span>TARGET_IP</span></code>
            <span class="api-description">Scamalytics score</span>
          </div>
        </div>
      </div>

      <footer class="footer">
        <p>
          © ${new Date().getFullYear()} <strong>Diana</strong> — proxy ip
          checker
        </p>
      </footer>
    </div>

    <div id="toast" class="toast"></div>
  </body>
</html>

  <script>
    let isChecking = false;
    const ipCheckResults = new Map();
    let pageLoadTimestamp;
    const TEMP_TOKEN = "${token}";
    let rangeChartInstance = null;
    let currentSuccessfulRangeIPs = [];

    function calculateTimestamp() {
      const currentDate = new Date();
      return Math.ceil(currentDate.getTime() / (1000 * 60 * 31));
    }
    
    document.addEventListener('DOMContentLoaded', function() {
      pageLoadTimestamp = calculateTimestamp();
      const singleIpInput = document.getElementById('proxyip');
      const rangeIpInput = document.getElementById('proxyipRange');
      singleIpInput.focus();
      
      const urlParams = new URLSearchParams(window.location.search);
      let autoCheckValue = urlParams.get('autocheck');
       if (!autoCheckValue) {
          const currentPath = window.location.pathname;
           if (currentPath.length > 1) {
            const pathContent = decodeURIComponent(currentPath.substring(1));
            if (isValidProxyIPFormat(pathContent)) {
                autoCheckValue = pathContent;
            }
          }
       }

       if (autoCheckValue) {
        singleIpInput.value = autoCheckValue;
        const newUrl = new URL(window.location);
        newUrl.searchParams.delete('autocheck');
        newUrl.pathname = '/';
        window.history.replaceState({}, '', newUrl);
        setTimeout(() => { if (!isChecking) { checkInputs(); } }, 500);
      } else {
        try {
            const lastSearch = localStorage.getItem('lastProxyIP');
            if (lastSearch) singleIpInput.value = lastSearch;
        } catch (e) { console.error('localStorage read error:', e); }
      }
      
      singleIpInput.addEventListener('keypress', function(event) { if (event.key === 'Enter' && !isChecking) { checkInputs(); } });
      rangeIpInput.addEventListener('keypress', function(event) { if (event.key === 'Enter' && !isChecking) { checkInputs(); } });
      document.addEventListener('click', function(event) {
        if (event.target.classList.contains('copy-btn')) {
          const text = event.target.getAttribute('data-copy');
          if (text) copyToClipboard(text, event.target, "Copied!");
        }
      });
    });

    function showToast(message, duration = 3000) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => { toast.classList.remove('show'); }, duration);
    }

    function copyToClipboard(text, element, successMessage = "Copied!") {
      navigator.clipboard.writeText(text).then(() => {
        const originalText = element ? element.textContent : '';
        if(element) element.textContent = 'Copied ✓';
        showToast(successMessage);
        if(element) setTimeout(() => { element.textContent = originalText; }, 2000);
      }).catch(err => { showToast('Copy failed. Please copy manually.'); });
    }
    
    function createCopyButton(text) { 
      return \`<span class="result-value">
        <span>\${text}</span>
        <button class="copy-btn" data-copy="\${text}">Copy</button>
      </span>\`; 
    }

    function isValidProxyIPFormat(input) {
        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\\-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9\\-]{0,61}[a-zA-Z0-9])?)*$/;
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6Regex = /^\\[?([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}\\]?$/;
        const withPortRegex = /^.+:\\d+$/;
        const tpPortRegex = /^.+\\.tp\\d+\\./;
        return domainRegex.test(input) || ipv4Regex.test(input) || ipv6Regex.test(input) || withPortRegex.test(input) || tpPortRegex.test(input);
    }

    function isIPAddress(input) {
      const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      const ipv6Regex = /^\\[?([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}\\]?$/;
      const ipv6WithPortRegex = /^\\[[0-9a-fA-F:]+\\]:\\d+$/;
      const ipv4WithPortRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?):\\d+$/;
      return ipv4Regex.test(input) || ipv6Regex.test(input) || ipv6WithPortRegex.test(input) || ipv4WithPortRegex.test(input);
    }

    function parseIPRange(rangeInput) {
        const ips = [];
        rangeInput = rangeInput.trim();
        if (/^(\\d{1,3}\\.){3}\\d{1,3}\\/24$/.test(rangeInput)) {
            const baseIp = rangeInput.split('/')[0];
            const baseParts = baseIp.split('.');
            if (baseParts.length === 4 ) {
                for (let i = 1; i <= 255; i++) {
                    ips.push(\`\${baseParts[0]}.\${baseParts[1]}.\${baseParts[2]}.\${i}\`);
                }
            } else {
                 showToast('Invalid CIDR format. Expected x.x.x.0/24.');
            }
        } 
        else if (/^(\\d{1,3}\\.){3}\\d{1,3}-\\d{1,3}$/.test(rangeInput)) {
            const parts = rangeInput.split('-');
            const baseIpWithLastOctet = parts[0];
            const endOctet = parseInt(parts[1]);
            
            const ipParts = baseIpWithLastOctet.split('.');
            if (ipParts.length === 4) {
                const startOctet = parseInt(ipParts[3]);
                const prefix = \`\${ipParts[0]}.\${ipParts[1]}.\${ipParts[2]}\`;
                if (!isNaN(startOctet) && !isNaN(endOctet) && startOctet <= endOctet && startOctet >= 0 && endOctet <= 255) {
                    for (let i = startOctet; i <= endOctet; i++) {
                        ips.push(\`\${prefix}.\${i}\`);
                    }
                } else {
                    showToast('Invalid range in x.x.x.A-B format.');
                }
            } else {
                 showToast('Invalid x.x.x.A-B range format.');
            }
        }
        return ips;
    }
    
    function preprocessInput(input) {
      if (!input) return input;
      let processed = input.trim();
      if (processed.includes(' ')) {
        processed = processed.split(' ')[0];
      }
      return processed;
    }

    async function fetchScamalyticsRiskInfo(ip) {
      if (!ip) return null;
      try {
        const cleanIP = ip.replace(/[\[\]]/g, '');
        const workerLookupUrl = \`./scamalytics-lookup?ip=\${encodeURIComponent(cleanIP)}&token=\${TEMP_TOKEN}\`; 
        const response = await fetch(workerLookupUrl);
    
        if (!response.ok) {
           console.error('Scamalytics request failed via Worker:', response.status, response.statusText);
           return null;
        }
        
        const data = await response.json();

        if (data.status === 'error') {
          console.error('Scamalytics API error (from worker):', data.message || data.error);
          return null;
        }
        
        if (data.scamalytics && data.scamalytics.status === 'error') {
            console.error('Scamalytics API error (from Scamalytics):', data.scamalytics.error);
            return null;
        }

        return data;
      } catch (error) {
        console.error('Error fetching from Scamalytics via Worker:', error);
        return null;
      }
    }

    function formatScamalyticsRiskInfo(data) {
      if (!data || !data.scamalytics || data.scamalytics.status !== 'ok') {
        return '<span class="badge info">Risk Unknown</span>';
      }

      const sa = data.scamalytics;
      const score = sa.scamalytics_score;
      const risk = sa.scamalytics_risk;
      
      let riskText = "Unknown";
      let badgeClass = "info";

      if (risk !== undefined && score !== undefined && risk !== null && score !== null) {
        const riskCapitalized = risk.charAt(0).toUpperCase() + risk.slice(1);
        riskText = \`\${score} - \${riskCapitalized}\`;

        switch (risk.toLowerCase()) { 
          case "low": badgeClass = "success"; break;
          case "medium": badgeClass = "warning"; break;
          case "high": case "very high": badgeClass = "error"; break;
          default: 
            badgeClass = "info";
            riskText = \`Score \${score} - \${riskCapitalized || 'Status Unknown'}\`;
            break;
        }
      } else if (score !== undefined && score !== null) {
        riskText = \`Score \${score} - N/A\`; 
      } else if (risk) {
        const riskCapitalized = risk.charAt(0).toUpperCase() + risk.slice(1);
        riskText = riskCapitalized;
        switch (risk.toLowerCase()) {
          case "low": badgeClass = "success"; break;
          case "medium": badgeClass = "warning"; break;
          case "high": case "very high": badgeClass = "error"; break;
          default: badgeClass = "info"; riskText = "Status Unknown"; break;
        }
      }
      
      return \`<span class="badge \${badgeClass}">\${riskText}</span>\`;
    }

    async function checkInputs() {
      if (isChecking) return;
      const singleIpInputEl = document.getElementById('proxyip');
      const rangeIpInputEl = document.getElementById('proxyipRange');
      const resultDiv = document.getElementById('result');
      const rangeResultDiv = document.getElementById('rangeResult');

      const checkBtn = document.getElementById('checkBtn');
      const btnText = checkBtn.querySelector('.btn-text');
      const spinner = checkBtn.querySelector('.loading-spinner');
      
      const rawSingleInput = singleIpInputEl.value;
      let singleIpToTest = preprocessInput(rawSingleInput);
      
      const rawRangeInput = rangeIpInputEl.value;
      let rangeIpToTest = preprocessInput(rawRangeInput);
      
      if (singleIpToTest && singleIpToTest !== rawSingleInput) {
        singleIpInputEl.value = singleIpToTest;
        showToast('Single IP input auto-corrected.');
      }
       if (rangeIpToTest && rangeIpToTest !== rawRangeInput) {
        rangeIpInputEl.value = rangeIpToTest;
        showToast('IP Range input auto-corrected.');
      }

      if (!singleIpToTest && !rangeIpToTest) {
        showToast('Please enter a single IP/Domain or an IP Range.');
        singleIpInputEl.focus();
        return;
      }
      
      const currentTimestamp = calculateTimestamp();
      if (currentTimestamp !== pageLoadTimestamp) {
        const currentHost = window.location.host;
        const currentProtocol = window.location.protocol;
        let redirectPathVal = singleIpToTest || rangeIpToTest || '';
        const redirectUrl = \`\${currentProtocol}//\${currentHost}/\${encodeURIComponent(redirectPathVal)}\`;
        showToast('TOKEN expired, refreshing page...');
        setTimeout(() => { window.location.href = redirectUrl; }, 1000);
        return;
      }

      if (singleIpToTest) {
          try { localStorage.setItem('lastProxyIP', singleIpToTest);
          } catch (e) {}
      }
      
      isChecking = true;
      checkBtn.disabled = true;
      btnText.style.display = 'none';
      spinner.style.display = 'inline-block';
      
      resultDiv.innerHTML = '';
      rangeResultDiv.innerHTML = '';
      rangeResultDiv.style.display = 'none';
      currentSuccessfulRangeIPs = [];
      if (rangeChartInstance) {
          rangeChartInstance.destroy();
          rangeChartInstance = null;
      }

      try {
        if (singleIpToTest) {
            if (isIPAddress(singleIpToTest)) {
                await checkAndDisplaySingleIP(singleIpToTest, resultDiv);
            } else { 
                await checkAndDisplayDomain(singleIpToTest, resultDiv);
            }
        }

        if (rangeIpToTest) {
            const ipsInRange = parseIPRange(rangeIpToTest);
            if (ipsInRange.length > 0) {
                showToast(\`Starting test for \${ipsInRange.length} IPs in range... This may take a while.\`);
                rangeResultDiv.style.display = 'block';
                rangeResultDiv.innerHTML = \`
                  <div class="result-card warning">
                    <div class="result-header">
                      <div class="result-icon warning">⟳</div>
                      <h3 class="result-title">Testing IP Range...</h3>
                    </div>
                    <div class="result-content">
                      <div class="result-item">
                        <span class="result-label">Progress</span>
                        <span class="result-value" id="rangeProgress">0/\${ipsInRange.length}</span>
                      </div>
                      <div class="result-item">
                        <span class="result-label">Successful IPs</span>
                        <span class="result-value" id="rangeSuccess">0</span>
                      </div>
                    </div>
                  </div>
                \`;

                let successCount = 0;
                let checkedCount = 0;
                currentSuccessfulRangeIPs = [];

                const batchSize = 10;
                for (let i = 0; i < ipsInRange.length; i += batchSize) {
                    const batch = ipsInRange.slice(i, i + batchSize);
                    const batchPromises = batch.map(ip => 
                        fetchSingleIPCheck(ip + ':443') 
                            .then(data => {
                                checkedCount++;
                                if (data.success) {
                                    successCount++;
                                    currentSuccessfulRangeIPs.push(data.proxyIP);
                                }
                                return data; 
                            })
                            .catch(err => {
                                checkedCount++; 
                                console.error("Error checking IP in range:", ip, err);
                                return {success: false, proxyIP: ip, error: err.message};
                            })
                    );
                    await Promise.all(batchPromises);
                    
                    document.getElementById('rangeProgress').textContent = \`\${checkedCount}/\${ipsInRange.length}\`;
                    document.getElementById('rangeSuccess').textContent = successCount;
                    
                    if (i + batchSize < ipsInRange.length) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
                
                // Update final results
                const finalResultClass = successCount === ipsInRange.length ? 'success' : 
                                       successCount > 0 ? 'warning' : 'error';
                const finalIcon = successCount === ipsInRange.length ? '✓' : 
                                successCount > 0 ? '⚠' : '✗';
                
                rangeResultDiv.innerHTML = \`
                  <div class="result-card \${finalResultClass}">
                    <div class="result-header">
                      <div class="result-icon \${finalResultClass}">\${finalIcon}</div>
                      <h3 class="result-title">Range Test Complete</h3>
                    </div>
                    <div class="result-content">
                      <div class="result-item">
                        <span class="result-label">Total IPs Tested</span>
                        <span class="result-value">\${ipsInRange.length}</span>
                      </div>
                      <div class="result-item">
                        <span class="result-label">Successful IPs</span>
                        <span class="result-value">\${successCount}</span>
                      </div>
                      <div class="result-item">
                        <span class="result-label">Success Rate</span>
                        <span class="result-value">\${((successCount/ipsInRange.length)*100).toFixed(1)}%</span>
                      </div>
                    </div>
                    \${currentSuccessfulRangeIPs.length > 0 ? \`
                      <div class="ip-grid">
                        \${currentSuccessfulRangeIPs.map(ip => \`
                          <div class="ip-item">
                            <div style="display: flex; align-items: center;">
                              <div class="status-indicator success"></div>
                              <span>\${ip}</span>
                            </div>
                            <button class="copy-btn" data-copy="\${ip}">Copy</button>
                          </div>
                        \`).join('')}
                      </div>
                      <button class="btn-primary" onclick="copySuccessfulRangeIPs()" style="margin-top: 1rem;">
                        Copy All Successful IPs
                      </button>
                    \` : ''}
                  </div>
                \`;
            } else if (rangeIpToTest) { 
                 showToast('Invalid IP Range format or empty range.');
                 rangeResultDiv.style.display = 'block';
                 rangeResultDiv.innerHTML = \`
                   <div class="result-card error">
                     <div class="result-header">
                       <div class="result-icon error">✗</div>
                       <h3 class="result-title">Invalid Range Format</h3>
                     </div>
                     <div class="result-content">
                       <p>Please use format: 192.168.1.0/24 or 192.168.1.1-255</p>
                     </div>
                   </div>
                 \`;
            }
        }

      } catch (err) {
        const errorMsg = \`
          <div class="result-card error">
            <div class="result-header">
              <div class="result-icon error">✗</div>
              <h3 class="result-title">General Error</h3>
            </div>
            <div class="result-content">
              <p>\${err.message}</p>
            </div>
          </div>
        \`;
        if(resultDiv.innerHTML === '') resultDiv.innerHTML = errorMsg;
        else {
            rangeResultDiv.innerHTML = errorMsg;
            rangeResultDiv.style.display = 'block';
        }
      } finally {
        isChecking = false;
        checkBtn.disabled = false;
        btnText.style.display = 'inline-block';
        spinner.style.display = 'none';
      }
    }
    
    function copySuccessfulRangeIPs() {
        if (currentSuccessfulRangeIPs.length > 0) {
            const textToCopy = currentSuccessfulRangeIPs.join('\\n');
            copyToClipboard(textToCopy, null, "All successful IPs copied!");
        } else {
            showToast("No successful IPs to copy.");
        }
    }

    async function fetchSingleIPCheck(proxyipWithOptionalPort) {
        const requestUrl = \`./check?proxyip=\${encodeURIComponent(proxyipWithOptionalPort)}&token=\${TEMP_TOKEN}\`;
        const response = await fetch(requestUrl);
        return await response.json();
    }

    async function checkAndDisplaySingleIP(proxyip, resultDiv) {
      const [checkData, ipInfo, riskInfo] = await Promise.all([
        fetchSingleIPCheck(proxyip),
        getIPInfo(proxyip.split(':')[0]),
        fetchScamalyticsRiskInfo(proxyip.split(':')[0])
      ]);

      const resultClass = checkData.success ? 'success' : 'error';
      const resultIcon = checkData.success ? '✓' : '✗';
      const resultTitle = checkData.success ? 'ProxyIP Valid' : 'ProxyIP Invalid';

      const ipInfoHTML = formatIPInfo(ipInfo);
      const riskInfoHTML = formatScamalyticsRiskInfo(riskInfo);

      resultDiv.innerHTML = \`
        <div class="result-card \${resultClass}">
          <div class="result-header">
            <div class="result-icon \${resultClass}">\${resultIcon}</div>
            <h3 class="result-title">\${resultTitle}</h3>
          </div>
          <div class="result-content">
            <div class="result-item">
              <span class="result-label">IP Address</span>
              \${createCopyButton(checkData.proxyIP)}
            </div>
            <div class="result-item">
              <span class="result-label">Port</span>
              \${createCopyButton(checkData.portRemote.toString())}
            </div>
            <div class="result-item">
              <span class="result-label">Security Risk</span>
              <span class="result-value">\${riskInfoHTML}</span>
            </div>
            \${ipInfoHTML ? \`
              <div class="result-item">
                <span class="result-label">Location</span>
                <span class="result-value">\${ipInfoHTML}</span>
              </div>
            \` : ''}
            \${checkData.statusCode ? \`
              <div class="result-item">
                <span class="result-label">Status Code</span>
                <span class="result-value">\${checkData.statusCode}</span>
              </div>
            \` : ''}
            <div class="result-item">
              <span class="result-label">Response Size</span>
              <span class="result-value">\${checkData.responseSize} bytes</span>
            </div>
            <div class="result-item">
              <span class="result-label">Check Time</span>
              <span class="result-value">\${new Date(checkData.timestamp).toLocaleString()}</span>
            </div>
            \${checkData.error ? \`
              <div class="result-item">
                <span class="result-label">Error</span>
                <span class="result-value" style="color: var(--error-color);">\${checkData.error}</span>
              </div>
            \` : ''}
          </div>
        </div>
      \`;
    }

    async function checkAndDisplayDomain(domain, resultDiv) {
      let portRemote = 443;
      let cleanDomain = domain;
      
      if (domain.includes('.tp')) {
        const portMatch = domain.match(/\\.tp(\\d+)\\./);
        if (portMatch) portRemote = parseInt(portMatch[1]);
        cleanDomain = domain.split('.tp')[0];
      } else if (domain.includes('[') && domain.includes(']:')) {
        portRemote = parseInt(domain.split(']:')[1]) || 443;
        cleanDomain = domain.split(']:')[0] + ']';
      } else if (domain.includes(':') && !domain.startsWith('[')) {
         const parts = domain.split(':');
         if (parts.length === 2) {
            cleanDomain = parts[0];
            const parsedPort = parseInt(parts[1]);
            if (!isNaN(parsedPort)) portRemote = parsedPort;
         }
      }
      
      resultDiv.innerHTML = \`
        <div class="result-card warning">
          <div class="result-header">
            <div class="result-icon warning">⟳</div>
            <h3 class="result-title">Resolving Domain...</h3>
          </div>
          <div class="result-content">
            <div class="result-item">
              <span class="result-label">Domain</span>
              \${createCopyButton(cleanDomain)}
            </div>
            <div class="result-item">
              <span class="result-label">Status</span>
              <span class="result-value">Processing...</span>
            </div>
          </div>
        </div>
      \`;

      const resolveResponse = await fetch(\`./resolve?domain=\${encodeURIComponent(cleanDomain)}&token=\${TEMP_TOKEN}\`);
      const resolveData = await resolveResponse.json();
      
      if (!resolveData.success) { 
        resultDiv.innerHTML = \`<div class="result-card result-error"><h3><span class="status-icon-prefix">✖</span> Resolution Failed</h3><p>\${resolveData.error || 'Domain resolution failed for ' + createCopyButton(cleanDomain)}</p></div>\`;
        return;
      }
      const ips = resolveData.ips;
      if (!ips || ips.length === 0) { 
        resultDiv.innerHTML = \`<div class="result-card result-error"><h3><span class="status-icon-prefix">✖</span> No IPs Found</h3><p>No IPs found for \${createCopyButton(cleanDomain)}.</p></div>\`;
        return;
      }
      
      ipCheckResults.clear();
      resultDiv.innerHTML = \`
        <div class="result-card result-warning" id="domain-result-card">
          <h3><span class="status-icon-prefix" id="domain-card-icon">⟳</span> Domain Resolution Results</h3>
          <p><strong>Domain:</strong> \${createCopyButton(cleanDomain)}</p>
          <p><strong>Default Port for Test:</strong> \${portRemote}</p>
          <p><strong>IPs Found:</strong> \${ips.length}</p>
          <div class="ip-grid" id="ip-grid" style="max-height: 200px; overflow-y: auto; margin-top:10px; padding:5px;">
            \${ips.map((ip, index) => \`
              <div class="ip-item" id="ip-item-\${index}">
                <div>
                  \${createCopyButton(ip)} 
                  <span id="ip-info-\${index}" style="font-size:0.8em;"></span>
                  <div class="risk-info" style="margin-top: 4px;">
                    <span id="risk-info-\${index}" style="font-size:0.8em;"></span>
                  </div>
                </div>
                <span class="status-icon" id="status-icon-\${index}">⟳</span>
              </div>
            \`).join('')}
          </div>
        </div>
      \`;
      resultDiv.classList.add('show');
      
      const checkPromises = ips.map((ip, index) => checkDomainIPWithIndex(ip, portRemote, index));
      const ipInfoPromises = ips.map((ip, index) => getIPInfoWithIndex(ip, index));
      const riskInfoPromises = ips.map((ip, index) => getRiskInfoWithIndex(ip, index));
      
      await Promise.all([...checkPromises, ...ipInfoPromises, ...riskInfoPromises]);

      const domainResultCardEl = document.getElementById('domain-result-card');
      const domainCardIconEl = document.getElementById('domain-card-icon');
      const resultCardHeader = domainResultCardEl.querySelector('h3');

      const validCount = Array.from(ipCheckResults.values()).filter(r => r.success).length;
      
      domainResultCardEl.classList.remove('result-warning', 'result-success', 'result-error');

      if (validCount === ips.length && ips.length > 0) {
        resultCardHeader.childNodes[1].nodeValue = ' All Domain IPs Valid';
        domainCardIconEl.className = 'status-icon-prefix success';
        domainCardIconEl.textContent = '✔';
        domainResultCardEl.classList.add('result-success');
      } else if (validCount === 0) {
        resultCardHeader.childNodes[1].nodeValue = ' All Domain IPs Invalid';
        domainCardIconEl.className = 'status-icon-prefix error';
        domainCardIconEl.textContent = '✖';
        domainResultCardEl.classList.add('result-error');
      } else {
        resultCardHeader.childNodes[1].nodeValue = \` Some Domain IPs Valid (\${validCount}/\${ips.length})\`;
        domainCardIconEl.className = 'status-icon-prefix warning';
        domainCardIconEl.textContent = '⚠';
        domainResultCardEl.classList.add('result-warning');
      }
    }

    async function checkDomainIPWithIndex(ip, port, index) {
      const statusIcon = document.getElementById(\`status-icon-\${index}\`);
      try {
        const ipToTest = ip.includes(':') || ip.includes(']:') ? ip : \`\${ip}:\${port}\`;
        const result = await fetchSingleIPCheck(ipToTest);
        ipCheckResults.set(ipToTest, result);
        
        if (statusIcon) {
             statusIcon.textContent = result.success ? '✔' : '✖';
             statusIcon.style.color = result.success ? 'var(--status-success-icon)' : 'var(--status-error-icon)';
        }
      } catch (error) {
        if (statusIcon) {
            statusIcon.textContent = '⚠';
            statusIcon.style.color = 'var(--status-warning-icon)';
        }
        ipCheckResults.set(ip, { success: false, error: error.message });
      }
    }
    
    async function getIPInfoWithIndex(ip, index) {
      try {
        const ipInfo = await getIPInfo(ip.split(':')[0]);
        const infoElement = document.getElementById(\`ip-info-\${index}\`);
        if (infoElement) infoElement.innerHTML = formatIPInfo(ipInfo, true);
      } catch (error) { }
    }

    async function getRiskInfoWithIndex(ip, index) {
      try {
        const riskInfo = await fetchScamalyticsRiskInfo(ip.split(':')[0]);
        const riskElement = document.getElementById(\`risk-info-\${index}\`);
        if (riskElement) riskElement.innerHTML = formatScamalyticsRiskInfo(riskInfo);
      } catch (error) {
        const riskElement = document.getElementById(\`risk-info-\${index}\`);
        if (riskElement) riskElement.innerHTML = '<span class="badge badge-neutral">Risk Unknown</span>';
      }
    }

    async function getIPInfo(ip) {
      try {
        const cleanIP = ip.replace(/[\\[\\]]/g, '');
        const response = await fetch(\`./ip-info?ip=\${encodeURIComponent(cleanIP)}&token=\${TEMP_TOKEN}\`);
        return await response.json();
      } catch (error) { return null; }
    }

    function formatIPInfo(ipInfo, isShort = false) {
      if (!ipInfo || ipInfo.status !== 'success') { return ''; }
      const country = ipInfo.country || 'N/A';
      const as = ipInfo.as || 'N/A';
      const colorStyle = \`color: var(--text-light);\`;
      if(isShort) return \`<span style="\${colorStyle}">(\${country} - \${as.substring(0,15)}...)</span>\`;
      return \`<span style="font-size:0.85em; \${colorStyle}">(\${country} - \${as})</span>\`;
    }
  </script>
</body>
</html>
`;
  return new Response(html, {
    headers: { 'content-type': 'text/html;charset=UTF-8' },
  });
}
