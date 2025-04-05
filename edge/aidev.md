سلام، متوجه مشکل شدم. شما انتظار دارید با کلیک روی دکمه، یک URI با فرمت `clash://install-config?url=...` به کلاینت Clash Meta ارسال بشه که پارامتر `url` اون خودش یک URL انکود شده (URL-encoded) باشه که شامل کانفیگ VLESS هست. اما در عمل، فقط بخشی از این URL و بدون پیشوند `clash://` و انکودینگ لازم ارسال می‌شه.

بیایید کد شما رو بررسی کنیم، به‌خصوص تابع `getDianaConfig` که مسئول تولید لینک‌هاست:

```javascript
function getDianaConfig(userCode, hostName) {
  // ... (تعریف protocol, networkType, baseUrl, commonParams) ...

  const freedomConfig =
    `${baseUrl}?path=/api/v4&eh=Sec-WebSocket-Protocol` + // مسیر freedomConfig تغییر کرده بود، اگر /api/v1 نیاز است، باید اصلاح شود.
    `&ed=2560&${commonParams}&fp=chrome&alpn=h3#${hostName}`;

  const dreamConfig =
    `${baseUrl}?path=/api/v2?ed=2048&${commonParams}` +
    `&fp=firefox&alpn=h2,http/1.1#${hostName}`;

  // *** بخش کلیدی برای Clash Meta ***
  const clashMetaSubscriptionUrl = `https://${hostName}/sub/clash-meta?url=${encodeURIComponent(freedomConfig)}`; // URL اشتراک که حاوی کانفیگ freedomConfig است
  // **توجه**: دامنه `revil-sub.pages.dev` در کد شما استفاده شده بود. اگر می‌خواهید از دامنه خودتان استفاده کنید، باید `hostName` را جایگزین کنید یا URL را به صورت استاتیک بنویسید. اینجا فرض می‌کنیم می‌خواهید از یک endpoint روی همین Worker استفاده کنید (که معمولا به این شکل نیست و باید یک URL ساب جداگانه داشته باشید). اگر URL ساب شما ثابت است (مثل `https://sub.victoriacross.ir/...`) آن را مستقیم بنویسید.

  // اگر URL ساب شما دقیقا همان `https://sub.victoriacross.ir/sub/clash-meta?url=...` است:
   const finalSubscriptionUrl = `https://sub.victoriacross.ir/sub/clash-meta?url=${encodeURIComponent(freedomConfig)}`;


  const clashMetaFullUrl =
    `clash://install-config?url=${encodeURIComponent(finalSubscriptionUrl)}` + // انکود کردن کل URL اشتراک
    `&remote_config=https://raw.githubusercontent.com/sahar-km/EdgeSub/refs/heads/main/public/minimal_remote_rules.ini` +
    // **مهم**: در مثال شما udp=false بود ولی در کدتان true بود. من false قرار دادم مطابق مثال "باید باشد".
    `&udp=false&ss_uot=false&show_host=false&forced_ws0rtt=false`;

  // ... (بقیه کد HTML) ...

  return `
  <!doctype html>
  <html lang="en">
    <head>
      <!-- ... head content ... -->
    </head>
    <body>
      <div class="container">
        <!-- ... other HTML content ... -->

        <!-- Sing-Box Core Clients -->
        <div class="config-card">
          <div class="config-title">Sing-Box Core Clients</div>
          <div class="config-content">
            <button class="copy-btn" onclick="copyToClipboard(this, '${freedomConfig}')">Copy</button>
            <pre>${freedomConfig}</pre>
          </div>
          <div class="client-config-card"> <!-- This div should contain the buttons -->
            <!-- Clash Meta - Updated with corrected URL -->
            <a href="${clashMetaFullUrl}" class="client-btn">
              <div class="client-icon">
                <!-- ... svg icon ... -->
              </div>
              Import to Clash-Meta
            </a>
            <!-- NekoBox -->
             <!-- NekoBox معمولا URL کانفیگ مستقیم رو می‌گیره، نه URL ساب -->
            <a href="nekobox://install-config?url=${encodeURIComponent(freedomConfig)}" class="client-btn" >
               <div class="client-icon">
                <!-- ... svg icon ... -->
              </div>
              Import to NekoBox
            </a>
             <!-- برای NekoRay/NekoBox که از clash meta core استفاده می‌کنند، می‌توان از لینک Clash Meta هم استفاده کرد -->
             <a href="${clashMetaFullUrl}" class="client-btn" >
               <div class="client-icon">
                 <!-- ... svg icon ... -->
               </div>
               Import to NekoBox (ClashMeta Mode)
             </a>
          </div>
        </div>

        <!-- ... footer and script ... -->
      </div>
    </body>
  </html>
  `;
}
```

**تحلیل و اصلاحات:**

1.  **ساختار URL Clash Meta:** فرمت صحیح `clash://install-config?url=SUBSCRIPTION_URL&PARAM=VALUE...` است. مقدار `SUBSCRIPTION_URL` خودش باید یک URL کامل باشه که به یک فایل کانفیگ یا پروفایل اشاره می‌کنه و این URL *باید* به صورت URL-encoded باشه.
2.  **انکودینگ تودرتو:**
    *   ابتدا شما `freedomConfig` (که `vless://...` است) را دارید.
    *   سپس این `freedomConfig` باید به عنوان پارامتر `url` در URL اشتراک (`https://sub.victoriacross.ir/sub/clash-meta?url=...`) قرار بگیره. برای اینکه کاراکترهای خاص `freedomConfig` (مثل `:`, `/`, `?`, `&`, `#`) باعث خراب شدن URL اشتراک نشوند، باید `freedomConfig` رو با `encodeURIComponent` انکود کنید.
    *   حالا URL اشتراک کامل (`finalSubscriptionUrl`) را دارید.
    *   این `finalSubscriptionUrl` باید به عنوان پارامتر `url` در URI اصلی `clash://install-config?url=...` قرار بگیره. باز هم برای اینکه کاراکترهای خاص `finalSubscriptionUrl` باعث خراب شدن URI اصلی نشوند، باید *کل* `finalSubscriptionUrl` رو با `encodeURIComponent` انکود کنید.
3.  **بررسی کد شما:** کد شما در بخش ساخت `clashMetaFullUrl` *به‌نظر می‌رسد* که این انکودینگ تودرتو را درست انجام داده است (`encodeURIComponent` داخلی برای `freedomConfig` و `encodeURIComponent` خارجی برای کل URL اشتراک).
4.  **مغایرت دامنه:** در کد شما از `https://revil-sub.pages.dev/sub/clash-meta?url=...` استفاده شده بود، اما در مثال‌تان از `https://sub.victoriacross.ir/sub/clash-meta?url=...` استفاده کردید. من در کد اصلاح شده از دامنه مثال شما (`sub.victoriacross.ir`) استفاده کردم (`finalSubscriptionUrl`). **مطمئن شوید که این URL اشتراک صحیح و فعال است.**
5.  **پارامتر `udp`:** در مثال "باید باشد" شما `udp=false` بود، اما در کد `udp=true`. من مطابق مثال شما `udp=false` را قرار دادم.
6.  **مسیر `freedomConfig`:** در کد شما `path=/api/v4` بود، اما در مثال‌تان `path=%2Fapi%2Fv1` (یعنی `/api/v1`). مطمئن شوید که مسیر صحیح را در `freedomConfig` قرار می‌دهید. (من `/api/v4` را نگه داشتم چون در کد بود).
7.  **مشکل احتمالی:** با توجه به اینکه کد شما *ظاهراً* درست به نظر می‌رسد، چند احتمال وجود دارد:
    *   **کد دیپلوی شده متفاوت است:** مطمئن شوید کدی که روی Cloudflare Worker اجرا می‌شود *دقیقا* همین کدی است که اینجا قرار دادید. شاید نسخه قدیمی‌تری دیپلوی شده باشد.
    *   **مشکل کش:** کش مرورگر یا کش Cloudflare ممکن است نسخه قدیمی صفحه را نشان دهد. کش‌ها را پاک کنید.
    *   **خطا در کپی/پیست یا تفسیر کلاینت:** گرچه بعید است، اما شاید در فرآیند انتقال URI به کلاینت مشکلی پیش می‌آید. با استفاده از Developer Tools مرورگر (Inspect Element) روی دکمه "Import to Clash-Meta" کلیک راست کرده و مقدار `href` لینک را بررسی کنید. آیا با `clashMetaFullUrl` که انتظار دارید مطابقت دارد؟

**راه حل پیشنهادی:**

1.  کد به‌روز شده بالا را (با توجه به نکات مربوط به دامنه URL اشتراک، پارامتر `udp` و مسیر `path`) جایگزین کد فعلی در Worker خود کنید.
2.  Worker را دوباره دیپلوی کنید.
3.  کش مرورگر و در صورت امکان کش Cloudflare را پاک کنید.
4.  دوباره تست کنید.
5.  اگر هنوز مشکل وجود داشت، مقدار `href` لینک را در مرورگر بررسی کنید تا ببینید آیا سرور URI صحیح را تولید می‌کند یا خیر.

اگر با انجام این مراحل مشکل حل نشد، ممکن است نیاز به بررسی بیشتری در سمت کلاینت یا نحوه تعامل مرورگر با پروتکل `clash://` باشد.
