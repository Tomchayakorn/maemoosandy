# แม่มูแซนดี้ ทำนายดวงชะตา — บ้าน ณ มัณตรา

เว็บดูดวงภาษาไทย (mobile-first): เติมเหรียญผ่านพร้อมเพย์ → ใช้เหรียญดูดวงด้วย AI (ไพ่ยิปซี 99 เหรียญ, ชื่อ + วันเกิด 199 เหรียญ) และหมุนกงล้อมหาเฮง

**Stack:** Next.js 16 (App Router, `cacheComponents`) · React 19 · Tailwind v4 · Supabase (Postgres/Auth/Realtime/Storage) · Claude (`claude-opus-5-5`) หรือ Gemini · framer-motion

## เริ่มต้นใช้งาน

```bash
npm install
cp .env.example .env.local   # แล้วกรอกค่า (ตารางด้านล่าง)
npm run dev                  # http://localhost:3000
npm test                     # Vitest
npm run build && npm run lint
```

ต้องใช้ Node 22+

## ตั้งค่า Supabase
1. สร้างโปรเจกต์ที่ supabase.com
2. เปิด **SQL Editor** แล้วรันตามลำดับ: `supabase/migrations/0001_init.sql` → `supabase/migrations/0004_wheel_paid_jackpot_cycle.sql`
   (0002 และ 0003 ถูกแทนที่ด้วย 0004 — ไม่ต้องรัน). 0004 ทำให้การหมุนกงล้อเป็น transaction เดียวใน SQL และเก็บตัวนับสปินแบบเสียเหรียญ (แจ็กพอต 5,000 เหรียญทุกสปินเสียเหรียญครั้งที่ 200; สปินฟรีไม่นับ)
3. ใส่ค่า URL / publishable key / secret key ใน `.env.local`
4. Authentication → URL Configuration: เพิ่ม Site URL และ Redirect URL `https://<โดเมน>/auth/callback` (และ `http://localhost:3000/auth/callback`)
5. เปิด Google OAuth ใน Authentication → Providers (ถ้าต้องการ). LINE: เพิ่ม custom OIDC provider แล้วใส่ id ใน `NEXT_PUBLIC_LINE_PROVIDER_ID` (เว้นว่าง = ซ่อนปุ่ม)

## ตัวแปรสภาพแวดล้อม

| ตัวแปร | ฝั่ง | หมายเหตุ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | `sb_publishable_…` (ชื่อเก่า `…_ANON_KEY` ใช้ได้) |
| `SUPABASE_SECRET_KEY` | **server** | `sb_secret_…` (ชื่อเก่า `SUPABASE_SERVICE_ROLE_KEY` ใช้ได้) |
| `NEXT_PUBLIC_SITE_URL` | public | โดเมนจริง ใช้กับ OAuth redirect, OG image, sitemap |
| `NEXT_PUBLIC_LINE_PROVIDER_ID` | public | เช่น `custom:line` |
| `AI_PROVIDER` | server | `claude` (ค่าเริ่มต้น) หรือ `gemini` |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | **server** | |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | **server** | เฉพาะ `AI_PROVIDER=gemini` |
| `PROMPTPAY_ID` | server | ตั้ง = QR แบบ dynamic ฝังยอดเงิน; ไม่ตั้ง = ใช้ `public/promptpay-qr.jpg` |
| `PROMPTPAY_RECEIVER_NAME` | server | ชื่อผู้รับตามที่ธนาคารพิมพ์บนสลิป |
| `PROMPTPAY_RECEIVER_ACCOUNT` | server | เบอร์/เลขบัญชีผู้รับ (ถ้าไม่ตั้ง จะใช้ `PROMPTPAY_ID`) |
| `SLIP_PROVIDER` | server | `easyslip` \| `slipok` \| `mock` (mock ใช้ได้เฉพาะ dev, ถูกปฏิเสธใน production) |
| `SLIP_API_KEY`, `SLIPOK_BRANCH_ID` | **server** | |
| `SLIP_MAX_AGE_HOURS` | server | ค่าเริ่มต้น 24 |

ห้ามใส่คำนำหน้า `NEXT_PUBLIC_` กับคีย์ที่เป็น server-only

## ความปลอดภัย (สรุป)
- ฝั่ง client แก้เหรียญ/สิทธิ์ไม่ได้: ไม่มี RLS policy สำหรับ INSERT/UPDATE/DELETE บน `wallets`, `transactions`, `wallet_ledger`, `fortune_logs`, `spin_logs`, `daily_checkins`
- การเปลี่ยนยอดทั้งหมดผ่าน RPC แบบ `SECURITY DEFINER` ที่ `service_role` เท่านั้นเรียกได้ API route ตรวจผู้ใช้ด้วย `getCurrentUser()` แล้วส่ง id ของผู้ใช้นั้นเอง ราคา/แพ็กเกจ/รางวัลอยู่ฝั่ง server
- สลิปซ้ำถูกกันด้วย `transactions.slip_ref` UNIQUE
- **Rate limit** (ต่อผู้ใช้ต่อนาที): ไพ่ 5, ดวงวันเกิด 5, ตรวจสลิป 6, หมุนกงล้อ 20, เช็กอิน 10 → 429 + `Retry-After`. เป็นแบบ in-memory ต่อ instance (best-effort บน Vercel); ถ้าต้องการเข้มงวดข้าม instance ให้ย้ายไป Upstash/ตาราง Supabase

## Deploy ขึ้น Vercel
1. Import repo → Framework: Next.js
2. ตั้ง Environment Variables ตามตารางด้านบน (Production) โดยตั้ง `NEXT_PUBLIC_SITE_URL` เป็นโดเมนจริง
3. **ห้ามมี `SLIP_PROVIDER=mock` ใน production**
4. เพิ่ม Redirect URL ของโดเมนใน Supabase (ข้อ 4 ด้านบน)
5. `maxDuration` ของ route ดูดวงตั้งไว้ 120 วินาที — ต้องใช้แพลนที่รองรับ

## Pre-launch checklist
1. เปลี่ยนการตรวจสลิปเป็นโหมดจริง: ลบ `SLIP_PROVIDER=mock`, ตั้ง `SLIP_API_KEY` (+ `SLIPOK_BRANCH_ID` ถ้าใช้ SlipOK), `PROMPTPAY_RECEIVER_NAME`, `PROMPTPAY_RECEIVER_ACCOUNT` — ไม่ตั้งผู้รับ ระบบจะปฏิเสธสลิปจริง (NOT_CONFIGURED) โดยตั้งใจ
2. ทดสอบโอนจริงยอดน้อย (แพ็ก 50฿) และส่งสลิปเดิมซ้ำเพื่อดูข้อความ "ถูกใช้แล้ว"
3. รัน migration 0004
4. หมุนเวียน (rotate) คีย์ที่เคยเผยในแชต (เช่น Gemini)
5. ตรวจว่า `NEXT_PUBLIC_SITE_URL` ถูกต้อง แล้วลองแชร์ลิงก์เพื่อดู OG image
