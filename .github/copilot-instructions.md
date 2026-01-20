
# تعليمات Copilot — Legal-AidFlow

⚠️ IMPORTANT:
AI agents MUST read this file fully before making any change.
If a request conflicts with these rules, STOP and ask the user.


## أوامر سريعة
- التطوير (Express + Vite middleware على نفس البورت): `npm run dev`
- Typecheck: `npm run check`
- Build: `npm run build` ثم تشغيل الإنتاج: `npm run start`
- Drizzle push: `npm run db:push` و psql: `npm run db:psql`
- Smoke: `npm run smoke:stage1`…`npm run smoke:stage6` و `npm run smoke:sessions`

## البورتات و single-port
- التصميم Single-port: الـAPI تحت `/api/*` والـSPA تُخدم من نفس السيرفر/البورت.
- macOS: بورت `5000` قد يتعارض مع ControlCenter.app → استخدم `PORT=5002` في `.env`.
- في dev: `server/index.ts` يشغّل Express ويُركّب Vite. في prod: يخدم `dist/public`.

## السيرفر (Express)
- المصادقة Session/Cookie (`express-session`) وليس JWT؛ المعرف في `req.session.userId`.
- CORS اختياري؛ عند تفعيله تُضبط الكوكيز على `SameSite=None` و `Secure`.
- الرفع: `POST /api/uploads` ببيانات raw؛ الملفات تُقدّم من `/uploads/<storageKey>`.

## تقسيم الـPortals (العميل)
- Staff UI: مسارات مثل `/dashboard`, `/cases`, `/tasks`.
- Beneficiary portal: `/portal/*` (محمي بـ `RequireBeneficiary`).
- Lawyer portal: `/lawyer/*` (Staff role=`lawyer`) وواجهاته تحت `/api/lawyer/*`.

## i18n
- i18next: الملفات `client/src/locales/en.json` و `client/src/locales/ar.json`.
- التزم بتطابق مفاتيح EN/AR لأي نص جديد؛ RTL يُدار في `client/src/i18n.ts`.

## قاعدة البيانات والمهاجرات
- المصدر الأساسي للـschema والـtypes: `shared/schema.ts`.
- المهاجرات في `migrations/` (إضافية فقط؛ لا تعدّل ملفات migrations القديمة).
- أعمال backfill/data migrations في `scripts/` (مثال: `npm run migrate:intake-case-types`).

## 🚫 DO NOT TOUCH – Critical Project Rules

The following files and behaviors are **STRICTLY FORBIDDEN** to modify unless explicitly requested by the user.

### Runtime & Proxy
- vite.config.ts  
  - Do NOT change `server.proxy`, `root`, or `build.outDir`
  - `/api` MUST proxy to `http://localhost:5002`
- client/src/lib/api.ts  
  - Do NOT change `API_BASE="/api"`
  - Do NOT remove `credentials: "include"`

### Authentication
- server/routes.ts (auth routes)
  - Do NOT rename or move:
    - `/api/auth/login`
    - `/api/auth/me`
    - `/api/auth/logout`
- Do NOT change cookie/session logic without full review

### i18n
- client/src/i18n.ts
- client/src/locales/ar.json
- client/src/locales/en.json
  - Do NOT duplicate namespaces (e.g. "sessions")
  - Do NOT create new keys unless explicitly asked

### Registration
- BeneficiaryRegistrationCard.tsx
  - Do NOT rename payload keys
- shared/schema.ts
  - Additive changes ONLY (never breaking)

### Database & Migrations
- migrations/
- schema.ts
  - Never delete columns or enum values

### Global Rule
- Never modify more than **ONE critical file** per change
- Always run `npm run check` after changes


### 🛑 Fail Fast Rule
If a change causes:
- Login failure
- API returning HTML instead of JSON
- /api/* returning 404
STOP immediately and report the exact diff that caused it.




🧰 Debug Playbook (Login / Proxy / i18n)

هدف هذا القسم: تشخيص الأعطال المتكررة بسرعة بدون تغييرات جانبية.

0) قاعدة ذهبية
	•	لا تغيّر أي كود قبل ما تثبت أين المشكلة بالأوامر أدناه.
	•	إذا ظهرت مشكلة جديدة بعد تعديل: اعرض git diff وارجع/تراجع فورًا عن آخر تغيير مشكوك فيه.

⸻

A) مشاكل Login (تسجيل الدخول)

A1) تحقق أن السيرفر شغال

lsof -nP -iTCP:5002 -sTCP:LISTEN || true

إذا ما فيه LISTEN:

npm run dev

A2) اختبر نقطة تسجيل الدخول مباشرة على السيرفر (بدون Vite)

node -e "fetch('http://localhost:5002/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123'})}).then(async r=>console.log('5002 login',r.status,(await r.text()).slice(0,120))).catch(console.error)"

A3) إذا نجح login لكن /me يرجع user:null

هذا غالبًا بسبب الكوكيز/الجلسة:
	•	اختبر بالكوكي يدويًا:

node - <<'NODE'
(async () => {
  const base='http://localhost:5058';
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123'})});
  const setCookie=login.headers.get('set-cookie')||'';
  const cookie=setCookie.split(';')[0];
  console.log('login',login.status,'cookie?',!!cookie);

  const me=await fetch(base+'/api/auth/me',{headers:{Cookie:cookie}});
  console.log('me',me.status,(await me.text()).slice(0,200));
})();
NODE

	•	إذا هذا نجح لكن المتصفح لا: مشكلة SameSite/Secure أو proxy أو اختلاف بورت.

⸻

B) مشاكل Proxy /api (HTML أو 404)

B1) تشخيص سريع: هل /api يرجع JSON ولا HTML؟

node -e "fetch('http://localhost:5058/api/auth/me').then(async r=>{const t=await r.text(); console.log('5058 /api/auth/me',r.status,'sample:',t.slice(0,80).replace(/\\n/g,' '));}).catch(console.error)"

	•	إذا العينة فيها <!DOCTYPE html> أو <html> → الـproxy غير شغال وVite يرجع SPA.

B2) تأكد vite.config.ts فيه proxy صحيح

sed -n '1,220p' vite.config.ts

لازم داخل server يوجد:

proxy: {
  "/api": {
    target: "http://localhost:5002",
    changeOrigin: true,
  },
},

B3) تحقق من السيرفر نفسه: هل API موجودة؟

بعض المشاريع ما فيها /api/health (مو لازم).
اختبر مسار موجود فعليًا مثل:

node -e "fetch('http://localhost:5002/api/auth/me').then(r=>console.log('5002 /api/auth/me',r.status)).catch(console.error)"
node -e "fetch('http://localhost:5058/api/auth/me').then(r=>console.log('5058 /api/auth/me',r.status)).catch(console.error)"

	•	إذا 5058 يرجع HTML → proxy
	•	إذا 5002 يرجع 404 لمسارات auth → السيرفر غلط/مسارات تغيرت (لا تغيّرها بدون طلب صريح)

B4) تشغيل الواجهة على 5058

npm run dev:client -- --port 5058


⸻

C) مشاكل i18n (مفاتيح تظهر sessions.xxx أو نصوص إنجليزية)

C1) تحقق وجود duplicate namespace داخل ملفات الترجمة

وجود أكثر من "sessions": {} يسبب تخبيص.

rg -n "\"sessions\"\\s*:" client/src/locales/ar.json client/src/locales/en.json

إذا تكررت كثير → فيه تكرار يحتاج تنظيف (لا يتم إلا بطلب صريح).

C2) تحقق مفاتيح صفحة Sessions مغطاة بالكامل

node - <<'NODE'
const fs=require("fs");
const src=fs.readFileSync("client/src/pages/Sessions.tsx","utf8");
const keys=[...src.matchAll(/t\\(["']sessions\\.([^"']+)["']\\)/g)].map(m=>m[1]);
const uniq=[...new Set(keys)].sort();
const ar=JSON.parse(fs.readFileSync("client/src/locales/ar.json","utf8"));
const en=JSON.parse(fs.readFileSync("client/src/locales/en.json","utf8"));
const missAr=uniq.filter(k=>ar.sessions?.[k]===undefined);
const missEn=uniq.filter(k=>en.sessions?.[k]===undefined);
console.log("Total:",uniq.length);
console.log("Missing AR:",missAr.length, missAr);
console.log("Missing EN:",missEn.length, missEn);
NODE

C3) قاعدة تصحيح Sessions بدون مفاتيح جديدة
	•	ممنوع إنشاء مفاتيح جديدة.
	•	فقط استبدل النصوص الخام/المفاتيح الغلط بمفاتيح موجودة مسبقًا.

⸻

D) أوامر تحقق ثابتة بعد أي تعديل

npm run check
git diff

D1) لو تعطل السيرفر بسبب EADDRINUSE

اعرف من ماسك البورت:

lsof -nP -iTCP:5002 -sTCP:LISTEN

ثم أوقفه:

kill -9 <PID>

ملاحظة: لا تضع أوامر متعددة في سطر واحد إلا إذا كنت متأكد من صياغة zsh.
:::

## 🔁 Before Any Fix Loop
If the same bug reappears:
1. Stop.
2. Re-run Debug Playbook from section A.
3. Compare with last known working git commit.
4. Do NOT attempt a second fix without diff review.