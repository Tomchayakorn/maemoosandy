@AGENTS.md

# แม่มูแซนดี้ ทำนายดวงชะตา บ้าน ณ มัณตรา

Online fortune-telling web app (Thai, mobile-first). Users top up coins via PromptPay,
spend them on AI readings (tarot 99 coins, name + birthdate 199 coins), and spin a
daily lucky wheel.

## Stack
- **Next.js 16 (App Router)**, React 19, TypeScript, Tailwind CSS v4 — `src/` layout, alias `@/*`
  - Next 16 differences: `src/proxy.ts` replaces `middleware.ts`; `cacheComponents` is ON, so any
    component that reads cookies/session must render inside `<Suspense>`. Read
    `node_modules/next/dist/docs/` before using an unfamiliar API.
- **Supabase** (Postgres + Auth + Storage + Realtime) via `@supabase/ssr`
- **Anthropic Claude** via `@anthropic-ai/sdk` (default, `claude-opus-5-5`); **Google Gemini** via `@google/genai` as an
  alternative (`AI_PROVIDER=gemini`). Both go through `src/lib/ai/engine.ts`.
- framer-motion (animation), canvas-confetti (gold confetti), html-to-image (share card), zod (input validation)
- Node 22 is installed at `~/.local/node` (PATH set in `~/.zprofile`)

## Commands
- `npm run dev` — dev server on http://localhost:3000
- `npm test` — Vitest unit tests (astrology)
- `npm run build` / `npm run lint` — must pass before a phase is considered done

## Security rules (non-negotiable)
1. **The client never changes coins or tickets.** No RLS policy allows client INSERT/UPDATE/DELETE on
   `wallets`, `transactions`, `wallet_ledger`, `fortune_logs`, `spin_logs`, `daily_checkins`.
   Clients may only SELECT their own rows, and update `profiles.display_name/avatar_url`.
2. All balance changes go through the SECURITY DEFINER RPCs in `supabase/migrations/0001_init.sql`,
   which only `service_role` can execute: `spend_coins`, `use_free_reading_ticket`, `refund_coins`,
   `credit_topup`, `spin_wheel`, `spin_wheel_cycle` (0004: free ticket else WHEEL_SPIN_COST coins under the wallet lock + global paid-spin counter + jackpot on every Nth paid spin; supersedes `spin_wheel_any`), `daily_checkin`.
3. API routes: verify the user with `getCurrentUser()` (`src/lib/supabase/server.ts`, uses `auth.getUser()`),
   then call RPCs with `createAdminClient()` (`src/lib/supabase/admin.ts`) passing **that** user's id.
   Never accept a user id, price, coin amount or reward from the request body.
4. Prices, packages and wheel weights live in server-side constants; randomness (tarot draw, wheel) is
   server-side with `crypto`.
5. Paid readings: `spend_coins` → AI call → insert `fortune_logs` with `ledger_id`. If the AI call fails,
   call `refund_coins(ledger_id)` (idempotent).
6. Top-up slips: `transactions.slip_ref` is UNIQUE; `credit_topup` is idempotent per slip and rejects reuse.
   The client sends only `packageId` + the image; amount/coins come from `PACKAGES`. Failed attempts are logged with
   `slip_ref = null` (so a slip can be re-sent with the right package). Without PROMPTPAY_RECEIVER_NAME /
   PROMPTPAY_RECEIVER_ACCOUNT (or a provider that confirms the receiver) real slips are refused (NOT_CONFIGURED).
7. `SUPABASE_SECRET_KEY` (legacy name `SUPABASE_SERVICE_ROLE_KEY` also accepted), `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SLIP_API_KEY` are server-only — never prefix with `NEXT_PUBLIC_`,
   and import server modules with `import "server-only"`.
8. RPC errors come back as codes in the message (`INSUFFICIENT_COINS`, `NO_SPIN_TICKETS`, ...);
   map them with `parseRpcError()` from `src/types/database.ts`.

## Structure
```
src/
  proxy.ts                    # refreshes Supabase session, redirects protected pages to /login
  app/
    layout.tsx, globals.css   # fonts + brand tokens
    page.tsx                  # home: header, hero, service cards (Phase 2)
    login/                    # page + login-form (client) + actions.ts (signIn/signUp/OAuth/signOut)
    auth/callback/route.ts    # OAuth + email-confirm code exchange
    tarot/                    # Phase 3a  → api/fortune/tarot
    birthdate/                # Phase 3b  → api/fortune/birthdate (199 coins; server computes the whole profile,
                              # client sends raw name/date/time/focus only)
    topup/                    # Phase 4   → api/topup/verify (multipart: packageId + slip image ≤4MB jpg/png/webp)
    history/                  # Phase 4   tabs: คำทำนาย (expand saved readings) · เติมเหรียญ · กงล้อ — RLS reads as the user
    lucky-wheel/              # Phase 5   → api/lucky-wheel/spin, api/lucky-wheel/checkin (both POST, empty body);
                              # page.tsx (Suspense gate: tickets + checked-in-today) + wheel-experience.tsx (logic: spin/check-in
                              # calls, result modal, confetti; router.refresh() when it stops)
  components/
    ui/                       # GoldButton (+goldButtonClass), MysticCard, SectionTitle, CoinBadge (Realtime), icons
    layout/                   # Header (logo static, user area in <Suspense>), UserMenu (sign out)
    home/                     # Hero, ServiceCard
    fx/                       # StarField (seeded PRNG), CrystalBallLoader, confetti.ts (goldCelebration, goldSparkleAt)
    audio/                    # BgmBootstrap (root layout: first-gesture start, pause when tab hidden), MusicToggle (header)
    wheel/                    # FantasyWheel.tsx: the 3D-look golden wheel, layered SVG 480×480 — flame ring (2 counter-rotating
                              # layers, one rAF loop eases 10→330°/s while `spinning`; CSS flicker via --fw-boost), speed streaks,
                              # embers, ornate gem-studded rim, recessed sapphire/gold segments, medallion hub, crown pointer that
                              # ticks per peg (motion value). Props: rotation (cumulative °), seconds, spinning, onComplete.
                              # No SVG filters on rotating content. SVG motion values use fill-box, so origins are "50% 50%" (a px origin like 240px
                              # is measured from the element's own box and made the disc orbit off-centre). CSS in globals.css (.fw-*); honours reduced motion.
    wheel/SpinFx.tsx          # random full-screen overlay during a spin (pointer-events-none, z-45, fades out via AnimatePresence when the wheel
                              # stops): CoinBurst (3D gold coins), ZodiacSweep (♈–♓ + chakra mandalas, left→right or right→left, starlight trails),
                              # PrizeOrbit (3D ring of prize cards), GrimReaper (effect 4, 3-plane 3D stage: single flash + lightning + 0.15s lunge scale 0.2→1.15 at
                              # REAPER_IMPACT_S=0.4s, shake on [data-wheel-box], dark vortex, runes, dissolves to mist by the end of the spin). Framer `times` must match each property's keyframe count → set per property.
    fortune/                  # ReadingCard (share target), TypewriterText (grapheme-safe), ShareButton (html-to-image),
                              # ReadAloudControl (play/pause + remembered auto-read toggle)
    tarot/                    # CardArt: ornate original SVG (viewBox 200×320, aspect 5:8) — bevelled gold frame,
                              # filigree corners, celestial surface, engraved suit/major motifs, Cinzel titles;
                              # per-instance ids via useId (required for many cards + html-to-image).
                              # FlipCard: 3D flip → floating card on .tarot-aura with a .tarot-sheen sweep
                              # TarotRoomBackground: public/tarot-room.jpg (1920×3412 portrait of Mae Mu Sandy's room)
                              # as a fixed next/image cover (centred 9:16 panel + blurred sides on md+). Tint is driven by
                              # <html data-tarot-mood="portrait|reading"> set in TarotExperience; text on the photo uses .on-photo.
                              # The page's <main> needs `isolate` so the -z-10 backdrop sits above <body>'s background.
  lib/
    supabase/{client,server,admin,proxy,config}.ts   # config: isSupabaseConfigured(), LINE_PROVIDER_ID
    pricing.ts                # FORTUNE_PRICES (tarot 99, birthdate 199) — server charges from here
    safe-redirect.ts          # safeNextPath() — use for every ?next= redirect
    wallet.ts                 # getMyWallet() (RLS read)
    api/rate-limit.ts         # rateLimitResponse(user.id, name) — call after requireUser(); RATE_LIMITS holds per-route budgets
    api/respond.ts            # requireUser(), parseJsonBody(zod), apiError(), rpcErrorResponse() — use in every API route
    ai/engine.ts              # generateReading()/isAiConfigured() — picks provider from AI_PROVIDER (default claude)
    ai/claude.ts              # Claude Opus 5.5 via @anthropic-ai/sdk: streaming, effort "medium", fallbacks "default"
    ai/gemini.ts              # Gemini (optional): gemini-3.8-flash + fallback models on 503/429/504
    ai/tidy.ts                # tidyReading() — normalise model markdown to "## " / "- " markup
    tts/thai-text.ts          # toSpeechPhrases(): strip markup/English glosses, expand ๆ/ฯลฯ, digit-by-digit hotlines,
                              # split at Thai spaces into short phrases (numbers stay glued) — pure, unit-testable
    tts/speech.ts             # Web Speech API: scoreThaiVoice() ranks Natural/Enhanced/Google above compact voices,
                              # unlockSpeech(); device voice only for now (owner declined a paid neural TTS, Nov 2026)
    tts/useReadAloud.ts       # auto-reads a reading on mount; call unlockSpeech() in the last tap before the API call;
                              # ducks the background music while status === "speaking"
    audio/wheelSfx.ts         # Web-Audio-synthesised spin sounds (coins / zodiac / orbit), no files. prime() in the click, play(fx,{seconds,dir}),
                              # stop() fades 0.3s when the wheel stops. 4th effect "reaper": sub-bass boom + cathedral-reverb brass drone + scythe ring. Silent when the header music toggle is off; ducks bgm key "wheel-sfx". Dev: window.__wheelSfx.debug()
    audio/bgm.ts              # background music singleton (public/tarot-bgm.mp3, 60s loop) via Web Audio GainNode
                              # (iOS ignores audio.volume): normal 0.18, ducked 0.06 (fade 0.5s down / 1.2s up),
                              # starts on first user gesture, on/off remembered in localStorage "bnm:bgm-enabled".
                              # Any voice/audio feature must call bgm.setDucked(key, true/false). Dev: window.__bgm.debug()
    ai/persona.ts             # MAE_MU_SANDY_SYSTEM — output markup: "## " headings, "- " bullets only
    tarot/deck.ts             # 78 cards (Thai names, meanings), DrawnCardView, TarotResponse — shared
    tarot/draw.ts             # drawThree() with crypto.randomInt (server-only)
    astrology/                # Phase 3b — pure, unit-tested (astrology.test.ts, `npm test`):
                              # calendar (พ.ศ./ค.ศ., validation), numerology (Thai + Latin letter table),
                              # taksa (day starts 06:00, Wed night = ราหู, กาลกิณี letters, colours),
                              # zodiac (ปีนักษัตร switches at Songkran 13 Apr; Thai sidereal + western signs),
                              # profile.ts computeBirthProfile(), prompt.ts buildBirthdatePrompt() (server-only)
    packages.ts               # PACKAGES (pkg_50/99/199/299/499/999 → 50/100/210/330/540/1050 coins); PackageId is derived from it;
                              # the server looks a package up by id only — to add one, edit PACKAGE_DEFS (+ tests)
    promptpay.ts              # QR: PROMPTPAY_ID set → dynamic EMVCo QR with amount; else static public/promptpay-qr.jpg
    slip/                     # providers: easyslip (API v2) | slipok (v1.8) | mock (dev only, refused in production);
                              # checks.ts = OUR rules (exact amount, receiver is us, ≤24h, not future) — unit-tested;
                              # SLIP_ERROR_MESSAGE = Thai customer messages; failure_reason in DB keeps internal detail
    wheel/segments.ts         # client-safe: 8 WHEEL_SEGMENTS (clockwise from top, index = API segmentIndex) + response types
    wheel/rewards.ts          # server-only odds: SEGMENT_WEIGHTS (sum 1,000, jackpot 0), JACKPOT_EVERY_PAID_SPINS=1000, expectedReturnPerPaidSpin()/returnRatio(), resolveSpin() reference model, pickStandardReward() via crypto.randomInt
    wheel/wheel.test.ts       # weights sum to 100, agreed odds, roll→segment mapping
  types/database.ts           # DB types + RPC error codes
supabase/migrations/0001_init.sql
supabase/migrations/0002_wheel_jackpot.sql   # raises spin_wheel coin cap 1000 → 5000 (superseded by 0003; optional)
supabase/migrations/0003_wheel_paid_spin.sql # spin_wheel_any (superseded by 0004)
supabase/migrations/0004_wheel_paid_jackpot_cycle.sql # wheel_state counter + spin_wheel_cycle — REQUIRED by /api/lucky-wheel/spin (RUN IN SQL EDITOR)
public/promptpay-qr.jpg         # owner's static PromptPay QR (ttb screenshot, no amount); shown cropped, unoptimized
```

## Business constants
- Tarot (3 cards): 99 coins · Birthdate + name: 199 coins · Lucky wheel: 1 free spin ticket, then **50 coins per spin, unlimited** (was 99 until 2026-11-20) (`WHEEL_SPIN_COST` in `src/lib/pricing.ts`)
- New user wallet: balance 0, spin_tickets 1
- Top-up packages: 50฿→50, 99฿→100, 199฿→210, 299฿→330, 499฿→540, 999฿→1,050 coins
- Wheel odds, ordinary spins (weights of 10,000; jackpot weight 0): retry 7,160 · 20 coins 1,900 (19%) · 40 coins 520 (5.2%) · "การ์ด +ความเฮง" 150 (1.5%) · 120 coins 100 (1%) · 400 coins 20 (0.2%) · free reading ticket 150 (1.5%) — 28.4% of normal spins win something. (20/40 were 20% / 5.5% until the hot streak was added.)
  **5,000-coin jackpot = every 1,000th PAID (50-coin) spin, global counter `wheel_state.paid_spin_count`; free-ticket spins never count and never win it** (RPC `spin_wheel_cycle`, migration 0004; the cycle length is a parameter, no SQL change needed).
  Return ≈ 17.53 coins per paid spin (12.5 ordinary incl. 1.5% × ~54-coin luck card + 5.0 jackpot) = **35.05% (owner keeps ≈ 65%)** — coin prizes are counted ×1.25 (wallet + the 25% cash tally, all assumed cashed out), free-reading ticket valued at 99 coins; a free-ticket spin costs the owner ≈ 12.5 coins. Check with `returnRatio()` (unit-tested 34–36%).
- Daily check-in: +1 spin ticket per Bangkok calendar day

## Design (brand)
- Always dark: velvet black `--velvet #0b0a12`, midnight navy `--midnight #121a33`, gold `--gold #d4af37`,
  light gold `--gold-light #f3d98b`, cream `--cream #f6efdc`. Tailwind classes: `bg-velvet`, `text-gold`,
  `text-cream`, `font-display` (Charm), `font-serif` (Noto Serif Thai), `font-sans` (Prompt).
- Utilities: `.text-gold-gradient`, `.border-gold-frame`, `.perspective-1000`, `.preserve-3d`, `.backface-hidden`,
  `.tarot-sheen` (light sweep on hover / `data-shine="true"`), `.tarot-aura` (breathing glow), `.tarot-name` (glowing gold
  text). `font-tarot` = Cinzel (Latin card titles/numerals).
- Mobile-first (design at 375px, max content width `max-w-md`), large tap targets, respect reduced motion.
- All user-facing copy is Thai. AI persona: "แม่มูแซนดี้ แห่งบ้าน ณ มัณตรา" — warm, kind, clear,
  direct, like an older sister / teacher; always ends with positive luck-enhancing advice.

## Testing notes
- framer-motion only animates while the Browser pane is visible (a hidden pane runs 0 rAF frames), so show the
  pane before checking animations; DOM state is the source of truth, screenshots can lag.
- To QA a paid flow without coins/AI, use a temporary dev-only page plus a `window.fetch` mock in the browser,
  and delete the page afterwards.
- Running `npm run build` while `next dev` is running can leave the dev server serving stale CSS; restart `next dev`
  if new CSS classes don't apply. After deleting a route, run a build before `tsc` (stale `.next/types`).

## Workflow
Built in phases (see plan): 1 Foundation & DB → 2 Auth/Layout/Home → 3a Tarot + AI → 3b Birthdate →
4 Top-up & slip → 5 Lucky wheel → 6 Polish & QA. Finish each phase with build + lint passing and
wait for the owner's confirmation before starting the next.

## Status (2026-11-18)
- DONE: Phase 1 (DB, RLS, RPCs — migration run on the real Supabase project), Phase 2 (auth, header, home),
  Phase 3a (tarot with Claude readings, ornate card art, room background, read-aloud, background music with
  ducking, logo emblem), Phase 3b (name + birthdate reading, −199 ledger entry verified).
- DONE: Phase 4 — top-up and history, owner-verified in mock mode:
  - Six packages: 50฿→50, 99฿→100, 199฿→210, 299฿→330, 499฿→540 (เจ้าสัวสายมู), 999฿→1,050 (มหาเศรษฐี ณ มัณตรา) coins.
  - /topup: package grid, owner's static QR `public/promptpay-qr.jpg` (no amount in it — the page shows the amount to
    type), slip upload, success screen with confetti, recent top-ups. /history: คำทำนาย · เติมเหรียญ · กงล้อ tabs.
  - Header coin badge updates live (Supabase Realtime on `wallets`) after a top-up.
  - Verified: 41 unit tests, build/tsc/lint green; e2e against the real Supabase with temporary users (all deleted):
    +540 / +1,050 credited, duplicate slips blocked (same/other user), RLS, ledger = balance.
- **CURRENT STATE — SLIP VERIFICATION IS IN MOCK MODE.** `.env.local` has `SLIP_PROVIDER=mock` (any image = a valid
  payment, credits real coins to the account; refused when NODE_ENV=production). It has NOT been run against a live
  provider (EasySlip API v2 / SlipOK v1.8 adapters are written from their docs, untested live).
- DONE: **Phase 5 — lucky wheel, 100% COMPLETE (owner-confirmed 2026-11-18)**: 3D wheel, 4 random full-screen spin effects incl. the layered 3D Grim Reaper (SpinFx.tsx: back smoke/embers z−170 · figure z0 · scythe z+100 in a CSS perspective stage; reaper CSS in globals.css), paid spins, daily check-in. Code + tests. Verified: 48 unit tests, build/tsc/lint green; real Supabase with a temporary user
  (deleted): spin/NO_SPIN_TICKETS/daily check-in (second call `granted:false`) RPCs, UI spin lands on the segment the server picked
  (DB reward_key matched), +10/+20 coin wins show in the modal and the header badge live, ledger = balance.
  [HISTORICAL — superseded 2026-11-18: spin-direct.ts is deleted, 0004 is required; see Phase 6 note below] Optional (recommended): run `supabase/migrations/0003_wheel_paid_spin.sql` in the Supabase SQL editor — it makes spins fully transactional
  and lifts the coin-prize cap to 5000 inside SQL (0002 is superseded). Not required: until it is installed `/api/lucky-wheel/spin` uses the fallback below.
- DONE: paid spins, LIVE-VERIFIED on the real DB. Route tries `spin_wheel_any(user, key, type, value, WHEEL_SPIN_COST)` first; if that RPC is missing
  (PGRST202, i.e. 0003 not run) it falls back to `src/lib/wheel/spin-direct.ts`: service-role table updates on `wallets` using a compare-and-swap
  (UPDATE … WHERE balance/spin_tickets/free_reading_tickets still equal what was read, retry ≤6×), then best-effort `spin_logs` + `wallet_ledger` rows.
  **Deliberate deviation from security rule 2** (balance changes only via RPCs), requested by the owner so the wheel works before 0003 is run; delete
  `spin-direct.ts` and the fallback branch once 0003 is installed. Live results: 1,288 coins/0 tickets → paid spin −99 +10 = 1,199, header updated live;
  free spin used the ticket and left coins unchanged; 8 parallel spins with 1 ticket + 150 coins → exactly 1 free + 1 paid succeeded, 6 got 402, final
  balance 71 = 150 − 99 + 20 (no double-spend); ledger matched. RPC details: the RPC picks free vs paid under the wallet row lock,
  INSUFFICIENT_COINS → 402; ledger rows: −99 (or −1 ticket) then the prize. Response adds `paid`, `cost`. UI buttons: "หมุนฟรี (ใช้สิทธิ์คงเหลือ N สิทธิ์)" /
  "หมุนต่อ (ใช้ 99 เหรียญ)" / "เหรียญไม่พอ เติมเหรียญเลย" → /topup. Verified: SQL logic in an in-memory Postgres (free spin, paid spin, exactly 99,
  98 → INSUFFICIENT_COINS, jackpot +5000, invalid prize); real-DB UI states for 0-ticket/<99, 0-ticket/≥99 and ticket>0; modal via mocked API.
  Economics: paid spin EV ≈ 58.5 coins + free-reading ticket EV (~3) vs 99 paid → ~38% house edge; free check-in spins cost ~61 coins each.
  Header CoinBadge fix: it now joins Realtime with the session access token (before, it received no events in the browser)
  and also follows the server-provided balance after `router.refresh()`.
  Economics: expected ≈ 58.5 coins per spin (jackpot alone = 50), + free-reading ticket EV; every user can check in daily for a free spin.
- NEXT / IN PROGRESS: **Phase 6 (polish/QA)** — code done 2026-11-18, awaiting owner review: `not-found.tsx`/`error.tsx`/`global-error.tsx` (Next 16 error boundaries get `retry`, not `reset`);
  SEO (`metadataBase`, OG/Twitter, `opengraph-image.tsx` with Noto Serif Thai fetched from Google Fonts at render, `icon.png`/`apple-icon.png` cropped from `public/logo-icon.png`,
  `robots.ts`, `sitemap.ts`, `noindex` on /login /topup /history); **rate limit** `src/lib/api/rate-limit.ts` (in-memory sliding window per verified user id, called right after
  `requireUser()` in all 5 POST routes, 429 + Retry-After; limits in `RATE_LIMITS`); README rewritten. Per-page `loading.tsx` skipped on purpose: every page already has a `<Suspense>` fallback.
  Audit results: real-Supabase RLS audit (temp user, deleted) — all client INSERT/UPDATE/DELETE on the 6 money tables and all RPC calls denied (42501), wallet unchanged; client-bundle secret scan clean.
  **Wheel jackpot cycle (2026-11-18, owner request):** jackpot only on every 200th PAID spin (free-ticket spins excluded). `/api/lucky-wheel/spin` tries RPC `spin_wheel_cycle` (migration 0004,
  re-probed every 60s) and, if it is missing, uses `src/lib/wheel/spin-direct.ts` — a NO-MIGRATION fallback (owner-requested; deliberate deviation from rule 2): wallet compare-and-swap + the paid-spin number is the rank of the spin's
  `wallet_ledger` row (reason 'spin', coins_delta −99) among all such rows, so no new table is needed and the count already includes past paid spins. 0004 seeds `wheel_state` from the same ledger count, so switching is seamless.
  Verified live on the real DB with a temp user (deleted): 99-coin spin 500→401, ledger −99 linked to spin_logs, global paid count 59→60. Jackpot #200 verified in unit tests (fake admin) + in-memory Postgres for the RPC, NOT live
  (inserting fake ledger rows into the real DB was refused). Fallback limits: no cross-instance lock (tiny race window if two serverless instances claim the same instant), prize credit is a 2nd step after the charge. Run 0004 for full atomicity, then delete spin-direct.ts.
  Economics: paid-spin EV ≈ 10.1 + 25 (jackpot/200) + free-reading ≈ 36 coins vs 99 paid; free spins EV ≈ 10 coins.
- Test coins were credited to the owner's account via `wallet_ledger` reason `admin` (no dev bypass in code).
- No git yet: Xcode Command Line Tools aren't installed on the owner's Mac, so `git` can't run.

- DONE (code, 2026-11-18): **Phase 7 — 5,000 THB jackpot withdrawal.** Migration `0005_jackpot_withdrawals.sql` (RUN IN SQL EDITOR after 0004): `wallets.jackpot_withdrawals_available`,
  `withdrawal_requests`, `spin_wheel_cycle` replaced (+1 quota inside the transaction ONLY on the jackpot; spin-direct.ts fallback does the same), RPCs `request_jackpot_withdrawal`
  (locks wallet; needs quota ≥1 and balance ≥5000; −5000 coins, −1 quota; ledger reason `withdrawal`) and `review_jackpot_withdrawal` (approve, or reject = +5000 coins +1 quota, ledger `withdrawal_refund`).
  Routes: `POST /api/withdrawals/request` (bankName/accountNumber/accountName only), `POST /api/admin/withdrawals/[id]` (`{action:"approve"|"reject"}`, admin only). Pages: `/withdraw` (form + history;
  banner `JackpotBanner` also on /lucky-wheel; menu link), `/admin/withdrawals` (404 for non-admins; shows the user's jackpot spin_logs). **Admin = emails in env `ADMIN_EMAILS`** (confirmed email only).
  Verified: tsc, lint, 67 tests, build green. NOT run against the real DB (0005 not yet applied) and not UI-tested in a browser.

- **Phase 5 — 100% COMPLETE (owner-confirmed end-to-end 2026-11-18)**: Lucky Wheel, 200-paid-spin jackpot cycle, 5,000 THB withdrawal system, admin dashboard, LINE admin push — all tested working.
  Production cleanup done: the `[โหมดทดสอบ]` grant button on /withdraw shows only when `NEXT_PUBLIC_SHOW_TEST_CONTROLS === "true"` (plus non-production + admin); the admin link in the LINE push uses
  `NEXT_PUBLIC_APP_URL` (fallback `http://localhost:3000`); the local test quota in `.data/withdrawals.json` was reset to 0. Set `NEXT_PUBLIC_APP_URL` to the real domain at deploy.
- **Phase 5 — CLOSED 2026-11-18 (code-complete)**: lucky wheel + 200-paid-spin jackpot cycle + 5,000 THB jackpot withdrawal + LINE admin push.
  Added this session: `/api/lucky-wheel/spin` wraps everything in try/catch (always JSON, never a bare 500) and the wheel client tolerates non-JSON bodies;
  `src/lib/line-notify.ts` `notifyAdminLine()` (never throws; env `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_ADMIN_USER_ID`, optional `NEXT_PUBLIC_LINE_OA_URL`, `NEXT_PUBLIC_SITE_URL`)
  is called by `POST /api/withdrawals/request`; `/withdraw` confirmation card shows the reference ID + green "แจ้งแอดมินผ่าน LINE OA ทันที" button.
  LINE verified live (test push delivered, HTTP 200). Still NOT verified against the real DB: migrations 0004 + 0005 must be run, `ADMIN_EMAILS` set.

- **Phase 6 re-verified 2026-11-18 (no new code needed — it was already built):** tsc clean, eslint clean, 67/67 tests, `npm run build` green (25 pages); dev server: `/`, `/login`, `/robots.txt`,
  `/sitemap.xml`, `/opengraph-image` → 200, unknown path → 404, `/topup` `/withdraw` `/admin/withdrawals` → 307 to /login, unauthenticated POST `/api/lucky-wheel/spin` → 401.
  Awaiting owner QA/confirmation of Phase 6; after that the remaining work is the pre-launch checklist below.

- **Slip verification now LIVE via Thunder (2026-11-18):** `src/lib/slip/thunder.ts` (API v1, field `file`, ≤4MB), `SLIP_PROVIDER=thunder` + `THUNDER_API_KEY` + `SHOP_BANK_ACCOUNT_NO/NAME/NAME_EN`
  (`src/lib/slip/receiver.ts`; TH or EN name picked by the slip's script). UI posts to `/api/topup/verify-slip` (alias of `/verify`); DUPLICATE → 400; LINE push to admin on each new credit;
  /topup shows PromptPay 083-779-2265 + copy button. `THUNDER_CHECK_DUPLICATE=false` disables Thunder's own duplicate flag. NOT yet tested with a real slip. The earlier "mock mode" note is superseded.

- **"ดวงดี มีเฮ" lucky card game (code done 2026-11-20, awaiting owner review):** 20 coins/round, flip 1 of 8 cards. Odds/prize live in ONE server-only file `src/lib/lucky-card-config.ts`
  (weights /10,000: SEE `src/lib/lucky-card-config.ts` (current formula 65/35); `SECRET_PRIZE_THB=1000`, 1,000 coins = 1,000 THB; price + bonus whitelist are also enforced in SQL). `src/lib/lucky-card/draw.ts` draws with crypto;
  108 messages in `src/data/lucky-card-messages.ts`. Routes: `POST /api/lucky-card/play` (`{cardIndex}` only → RPC `play_lucky_card`: charge + bonus + secret-prize entitlement + log in one transaction),
  `POST /api/lucky-card/withdraw` (`{prizeId, bank…}` → RPC `request_lucky_card_withdrawal`, prize flips pending→withdrawn once). Secret prize is NOT credited as coins: row in `lucky_card_prizes`;
  "ถอนทีหลัง" prizes are listed on /withdraw (`PendingPrizeList`) and in /admin/withdrawals (`withdrawal_requests.source='lucky_card'`; reject restores the prize). Page `/lucky-card`, home card, `/lucky-card` is a protected prefix.
  **MIGRATION `0006_lucky_card.sql` MUST BE RUN in the SQL editor (after 0005) — no fallback; the game returns 503 until then.** It also relaxes `withdrawal_requests` (amount no longer fixed 5,000).
  Verified: tsc, lint, 73 tests, build green; pages/API smoke-tested (unauth → 307/401). NOT verified: the SQL itself, real-DB play, browser UI.

- **Lucky card bonus cash-out (code done 2026-11-20, awaiting owner review):** bonus coins (100/300/500) still go to the main wallet AND add to `wallets.lucky_card_bonus_total` (same RPC statement, same wallet lock).
  Progress bar + "ถอน 1,000 บาท" button on /lucky-card; withdraw = `POST /api/lucky-card/bonus-withdraw` (bank details only) → RPC `request_lucky_card_bonus_withdrawal` (fixed 1,000, idempotent while one is pending;
  partial unique index = one pending per user) → `withdrawal_requests.source='lucky_card_bonus'` + LINE push to admin. (Since 0009) the 1,000 are RESERVED at request time (counter −1,000, `withdrawal_requests.bonus_reserved`); admin approve = status only; reject = counter +1,000 back. Main balance never touched.
  Odds now (per 10,000): natural 100-coin 8 · 300-coin 55 · 500-coin 1 · secret 2 · message 9,934 + bonus guarantee → bonus counted twice + secret = 7.005 per 20 (35% back, 65% kept; formula 65/35, set 2026-11-20) — `expectedReturnPer20()` in `lucky-card-config.ts`.
  **MIGRATION `0007_lucky_card_bonus_withdrawal.sql` MUST BE RUN after 0006** (also backfills the counter from past plays once). Secret prize "เทพประทานทรัพย์" kept as is.

- **Lucky card bonus guarantee / pity (code done 2026-11-20):** after `PITY_AFTER_DRY_ROUNDS` (50) rounds in a row with no bonus/secret, the next round is a guaranteed 100-coin bonus (`PITY_BONUS_COINS`).
  Counter `wallets.lucky_card_dry_rounds`; the guarantee is applied INSIDE `play_lucky_card` under the wallet lock (race-free) — the route still draws the natural result and passes `p_pity_after/p_pity_bonus`;
  if migration **0008_lucky_card_pity.sql** isn't installed yet (PGRST202) the route falls back to the old behaviour (no guarantee). Natural 100-coin weight was lowered to pay for the guarantee (and later for the 0.55% 300-coin tier) so the total stays on target:
  `expectedReturnPer20()` is the analytic renewal-reward value (7.005 now), pinned by a test; a seeded 1.5M-round simulation test checks ≤50 dry rounds and ~7.0. `resolvePity()` in `lucky-card/draw.ts` is the reference model.

- **Bonus cash-out v2 — reserve at request + "เก็บไว้ก่อน" (code done 2026-11-20):** migration **0009_lucky_card_bonus_reserve.sql** (run after 0008; also converts any still-pending 0007-style request once).
  `request_lucky_card_bonus_withdrawal` locks the wallet FOR UPDATE, returns the existing pending request if any (idempotent, nothing reserved twice), else needs counter ≥ 1,000 and deducts 1,000 immediately; partial unique index = one pending per user.
  UI: `BonusWithdrawAction` (shared by /lucky-card and /withdraw): ready → "ถอน 1,000 บาท" + (game only) "เก็บไว้ก่อน / ถอนทีหลัง" (UI-only collapse, counter untouched, reopen any time); pending → "มีรายการขอถอนกำลังรอตรวจสอบ" + disabled button;
  re-syncs on tab focus (router.refresh) so a 2nd tab/device sees pending. /withdraw shows `BonusWithdrawCard` (evidence: remaining total, ready/pending) when total ≥ 1,000 or a request is pending, and history rows carry a source label (`WITHDRAW_SOURCE_LABEL`).
  `lucky-card/bonus-ledger.ts` = pure reference model of the SQL rules, tested for double click / 2 tabs / approve / reject / double review / conservation invariant (the SQL itself is NOT tested against a real DB).

- **Wheel re-priced 2026-11-20 (code done, awaiting owner review):** spin 99 → **50 coins**; prizes 10/20/50 → **25 (half back) / 50 (break-even) / 150 / 500**, free reading + 5,000 jackpot kept; jackpot cycle 200 → 500 → **1,000** paid spins because at a 50-coin price
  one jackpot per 200 spins alone would return 50% of revenue; 1,000 keeps it at 10% and lets the 25/50 prizes hit ~31% of spins. Weights/EV in `src/lib/wheel/rewards.ts`. No migration needed (the RPC takes cost, prizes ≤ 1,000 and the cycle as parameters).
  Caveats: the no-migration fallback `spin-direct.ts` ranks paid spins by ledger rows of exactly −cost, so it would restart its count at the new price (production uses the RPC counter `wheel_state`, unaffected).

- **Wheel "การ์ด +ความเฮง" (luck card, code done 2026-11-21, awaiting owner review):** the second "ลองใหม่" slice became a luck-card slice (1.5%). Winning one adds a card (`wallets.luck_cards`); the player presses "ใช้การ์ด"
  (`POST /api/lucky-wheel/use-card` → RPC `use_luck_card`, refused while a buff runs: BUFF_ALREADY_ACTIVE / NO_LUCK_CARDS) → `wallets.luck_buff_rounds = 3`. For the next 3 spins (free or paid, jackpot spin included) the 500-coin weight is ×1.3 (20 → 26 of 10,000),
  the extra taken from "retry" only. The route draws BOTH an ordinary and a buffed reward (crypto) and passes the buffed one as `p_buff_reward_*`; `spin_wheel_cycle` (migration **0010_wheel_luck_card.sql**, run after 0009) picks under the wallet lock and returns the applied
  `reward_key`, `luck_cards`, `luck_buff_rounds`, `buff_applied`. Without 0010 the route falls back to the 0005 function and turns a luck-card draw into "retry". Client-safe constants/model: `src/lib/wheel/luck-card.ts` (BUFF_ROUNDS=3, BUFF_MULTIPLIER=1.3); odds/EV: `rewards.ts`
  (`buffedWeights()`, `luckCardValueCoins()` = 0.9 coins). UI: panel with card count + "ใช้การ์ด" + "บัฟ +ความเฮง เหลือ n/3 รอบ" (only shown when a card/buff exists).
  **Coins rule:** a card won with < 50 coins is kept (`luck_cards` is credited with the prize, no balance condition). "ใช้การ์ด" needs a free ticket OR ≥ 50 coins: `use_luck_card(p_user_id, p_rounds, p_min_balance)` raises INSUFFICIENT_COINS otherwise (card not consumed),
  the UI disables the button and shows a "เติมเหรียญ" link; a running buff never expires by time and a spin that fails for lack of coins rolls back (no round used). 0010 is re-runnable (drops the old 2-arg `use_luck_card`). Verified in the browser pane at 375×812 with mocked APIs; the SQL is NOT tested against a real DB.

- **Luck-card buff "stuck at 3/3" — root cause + fix (2026-11-21):** every one of the 475 spin_logs in the live DB has a NULL `paid_spin_number`, i.e. `spin_wheel_cycle` never completed for a paid spin; the route silently fell back to
  `spin-direct.ts` (no luck cards / buff), so `luck_buff_rounds` never counted down and won cards were dropped. Most likely cause: `public.wheel_state` missing → 42P01 inside the RPC, which the route treated as "function missing".
  Fixes: (1) migration **0011_wheel_state_ensure.sql** (create-if-missing + seed counter from paid-spin ledger rows; idempotent) — RUN IT; (2) the fallback is now luck-aware (`src/lib/wheel/luck-direct.ts`: reads the buff, uses the buffed draw, then
  decrements the buff / adds a won card with a compare-and-swap); (3) the route now `console.error`s whenever it falls back (check Vercel logs). UI: while the buff runs the wheel shows a golden aura, the 500-coin slice pulses (`highlightKey`), the panel glows and says
  "กำลังใช้บัฟ +ความเฮง ลุ้น 500 เหรียญ · เหลือ n/3 รอบ"; after the 3rd spin all of it switches off and a notice says the buff ended. State always comes from the latest spin response.

- **Luck-card buff v2 — every buffed spin wins (2026-11-21, awaiting owner review):** while `luck_buff_rounds > 0` the buffed draw has NO "retry": retry → 0, 500-coin ×1.3 (20 → 26), the freed weight goes to the 25-coin prize (25 = 90.2% of a buffed spin; spreading it proportionally would return ~78% of the price).
  A card is now worth ≈ 53.6 coins (`luckCardValueCoins()`, closed form incl. cards won during a buff); to stay at ~35% the normal 25-coin weight was lowered 23% → 20%. Enforced in 3 places: `buffedWeights()` + a route guard, and the DB — migration **0012_luck_buff_no_retry.sql**
  (replaces `spin_wheel_cycle`: a buffed reward of type 'none' → INVALID_REWARD, and a running buff requires a buffed reward to be passed). Run 0012 after 0011. UI copy: "การันตีได้รางวัลทุกตาตลอด 3 รอบ + เพิ่มโอกาสได้ 500 เหรียญ 30%".

- **Wheel cash tally + tiered cash-out (code done 2026-11-21, awaiting owner review):** `wallets.wheel_cash_total` = "ยอดสะสมจากการหมุนเกม", separate from the main wallet. Every PAID, non-jackpot spin that wins coins adds **25%** of the prize (`WHEEL_CASH_PCT`, integer floor) in the same statement as the prize
  (`spin_wheel_cycle` 13th param `p_cash_pct`); free-ticket spins and the jackpot never add. Cash-out: **500 tally = 500 THB** (small tier, quota **1 per Bangkok day and 3 per week**, pending+approved count, rejected frees the slot) and **5,000 = 5,000 THB** (big tier, no quota, admin approves).
  `POST /api/lucky-wheel/cash-withdraw` (`{tier, bank…}`) → RPC `request_wheel_cash_withdrawal`: wallet FOR UPDATE, one pending request per user (idempotent, partial unique index), needs tally ≥ tier, RESERVES the tier at once (rejected → tally back); `withdrawal_requests.source='wheel_cash'`, `bonus_reserved=true`.
  The existing jackpot cash-out (jackpot_withdrawals_available) is a separate flow and unchanged. Migration **0013_wheel_cash_tally.sql** (run after 0012; no backfill — tally starts at 0). Constants/rules/reference model: `src/lib/wheel/cash.ts` (unit-tested incl. Bangkok day/week boundaries). UI: `WheelCashPanel` (tally, two progress bars 500/5,000, quota left, pending state, withdraw buttons) + a "+N เข้ายอดสะสม" note in the spin result.
  No-RPC fallback also adds to the tally (`addWheelCash`). The buff copy now says 400 (the boosted slice). EV: unchanged 35.05% because prizes ×0.8 and the tally adds ×0.25 (the budget counts every tally coin as cashed out; the real cost is lower because unwithdrawn residue is kept).

- **Wheel "มือขึ้น 5 ตาติด" hot streak (code done 2026-11-21, awaiting owner review):** after a PAID spin outside a streak the route's crypto roll (`randomInt(250) === 0`, `HOT_TRIGGER_ONE_IN`) may start a streak; the NEXT 5 spins (free or paid) use `HOT_WEIGHTS` = retry 18% · 20 coins 60% · 40 coins 17% · 120 coins 2.5% · 400 coins 0.5% · free reading 2%
  (80% coin prize, no luck card, no jackpot). Precedence per spin: jackpot > luck-card buff > hot streak > ordinary. State `wallets.hot_streak_rounds` (0..5); migration **0014_wheel_hot_streak.sql** (run after 0013) replaces `spin_wheel_cycle` with an 18-arg version (`p_hot_trigger`, `p_hot_reward_*`, `p_hot_rounds`);
  a running streak requires a hot reward to be passed (else INVALID_REWARD). The route tries 18 → 13 → 12 → 9 arg signatures; the no-RPC fallback honours the streak too (`readHot/applyHotAfterSpin`). The streak is SHOWN (banner "🔥 มือขึ้น! … เหลือ n/5 รอบ" + orange aura), never hidden. Reference model: `src/lib/wheel/hot-streak.ts`.
  Cost of a streak ≈ +100 coins; ~2% of spins are hot (one streak per ~257 spins), paid for by lowering the ordinary 20/40-coin weights. `src/lib/wheel/sim.test.ts` simulates the whole machine (jackpot + buff + hot + 25% tally) over 2M spins: return 35.06%, ownerKeeps 64.9%.
  NOT in the code (and not added): a "no 3 retries in a row" cap and 2–3-spin mini streaks — they never existed in the wheel.

- **Lucky card two-step guarantee + 46% return (code done 2026-11-22, awaiting owner review):** replaces the 50-round pity (0008). Step 1: every 10th round in a row without a bonus/secret = guaranteed 15-coin bonus
  (`wallets.lucky_card_dry_rounds`). Step 2: every 25th round overall (continuous `wallets.lucky_card_cycle_rounds`, natural wins don't reset it) = guaranteed 40-coin bonus; step 2 wins if both are due; only plain messages are upgraded.
  Applied in SQL under the wallet lock — **MIGRATION `0015_lucky_card_two_step_guarantee.sql` (run after 0014)** — the route passes `p_g1_*`/`p_g2_*` from `GUARANTEE_*` in `lucky-card-config.ts`; without 0015 the game works but has no guarantee/countdown.
  Natural odds per 10,000: 100-coin 16 · 300-coin 52 · 500-coin 1 · secret 2. Return (bonus counted twice, secret at 1,000) = **46.1%** (owner keeps ~54%); `expectedReturnPer20()` is an exact Markov-chain value and `draw.test.ts` simulates 1,000,000 rounds (46.2%, max dry streak 9).
  UI: countdown box "อีก N รอบ การันตีโบนัส …" (display only, counters come from the server response / wallet row). The "reveal the other cards faintly" idea was NOT built: outcomes are a single server roll, so any content shown on the other cards would be invented.

- **"น้องเหมียว 9 ชีวิต" cat game (code done 2026-11-22, awaiting owner review):** 9 coins/round, ONE play per Bangkok calendar day, pick 1 of 9 cats (3 orange / 3 black / 3 white, `public/images/cat-*.jpeg`),
  reward 200/300/400/500/1,000 coins each with an equal 20% chance, ALL credited to the main wallet (no tally, no separate withdrawal). Constants + board + daily-limit reference model: `src/lib/cat-game/config.ts` (client-safe; add more
  pictures per colour in `CAT_IMAGES`); crypto draw: `src/lib/cat-game/draw.ts`. `POST /api/cat-game/play` ({catIndex} only) → RPC `play_cat_game` (**MIGRATION `0016_cat_game.sql`, run after 0015**): wallet FOR UPDATE, `cat_game_plays` UNIQUE(user_id, play_date)
  → ALREADY_PLAYED_TODAY, INSUFFICIENT_COINS, charge + prize + 2 ledger rows (`catgame`, `catgame_prize`) in one transaction; without 0016 the route answers 503 and the page shows "not ready". Page `/cat-game` (protected prefix), home card, rules pop-up
  (`RulesGate game="cat-game"`, `CatGameRules`). **Economics: average payout 480 coins for a 9-coin play (expected loss ≈ 471 coins per player per day) — see the owner note when it was built.**
  **Error alerts to LINE (2026-11-22):** `src/lib/admin-alert.ts` `alertAdminError()` (on top of `notifyAdminLine`, same env `LINE_CHANNEL_ACCESS_TOKEN` + `LINE_ADMIN_USER_ID`) pushes a short message (Thai time, failing place, user id, error) ONLY on real errors: `play_cat_game` failures / exceptions in `POST /api/cat-game/play`, and `admin_reset_cat_game` / lookup / `/admin/cat-game` failures. Expected outcomes (INSUFFICIENT_COINS, ALREADY_PLAYED_TODAY, NOTHING_TO_RESET) never alert; the same error is sent at most once per 5 min; the helper never throws.
  **Admin reset (2026-11-22): `/admin/cat-game` (admin-only) looks a player up by exact email/id and gives today's chance back — `POST /api/admin/cat-game/{lookup,reset}` → RPC `admin_reset_cat_game` (MIGRATION `0017_cat_game_admin_reset.sql`, after 0016): deletes only today's `cat_game_plays` row, audits it in `cat_game_admin_resets`, never touches wallet/ledger.**
  **Playable surprise (2026-11-23):** the pop-up is now a mini game: a 3×3 `CatBoard` inside the modal (`CatSurprise` = view, `CatSurpriseLive` = state + `playCatGame()` from `src/lib/cat-game/client.ts`, same `POST /api/cat-game/play` / `play_cat_game` as the game page, so no new SQL). 0–8 coins = board locked + top-up button. A tap holds -9 on `walletBus` (header badge), shows the reward + blessing (`catBlessing`) + next-play time, releases the server balance at once and calls `router.refresh()` so the page's own balance follows. `CatSurpriseHost` now keeps rendering after today's play (`playedToday` prop) so the result is not lost on refresh; `popupVisible()` keeps a round/result on screen.
  **Surprise pop-up (2026-11-22):** `CatSurpriseHost` (server: wallet + today's play) → `CatSurpriseLive` (client) is mounted on the home page, /lucky-wheel and /lucky-card and follows the balance live via `walletBus` (settled `release/set` values; hold = ignored), so it appears the moment the balance falls into range, with no refresh. Dismissal key = user+state+Bangkok day+BALANCE (fix 2026-11-22: without the balance, closing it once hid it all day), and it shows `SURPRISE_GRACE_MS` (1.2s) after the screen is free. It WAITS while anything else is on screen: `useSurpriseBlock()` (`surprise-block.ts`) is used by RulesGate, the wheel (spin + result modal) and the lucky card (only while a round is being drawn). A modal appears when the balance is 9–50 coins and today's play is unused ("offer"; 50 = one wheel spin, updated 2026-11-22), or 0–8 coins ("low": needs ≥ 9 to start, top-up link). Rules in `src/lib/cat-game/surprise.ts`;
  a dismissal is kept in sessionStorage per user + state + Bangkok day (no re-pop). The pop-up only advertises the game — the server does NOT limit play by balance.

- **Daily income/expense summary to LINE (code done 2026-11-23, awaiting owner review):** Vercel Cron (`vercel.json`, `5 17 * * *` UTC = 00:05 Bangkok) → `GET /api/cron/daily-summary` (auth: `Authorization: Bearer $CRON_SECRET`, closed when unset; `?dryRun=1` and `?date=YYYY-MM-DD` for checking) summarises the PREVIOUS Bangkok day and pushes it with `notifyAdminLine`.
  **Income** = `transactions` rows `status='success'` by `created_at` (inserted as success by `credit_topup`; `provider='mock'` test credits excluded). **Expense** = `withdrawal_requests` `status='approved'` by `reviewed_at` (the admin's "โอนเงินแล้ว" click), all sources, with a per-source breakdown. Pure logic + tests: `src/lib/daily-summary.ts`; DB + LINE: `src/lib/daily-summary-job.ts`.
  **Abnormal top-ups are never income (2026-11-23):** only a normal slip top-up counts (`isRealSlipTopup`: provider thunder/easyslip/slipok, a `slip_ref`, a known package whose price = `amount_thb` and coins = `coins_added`); mock, manual/null-provider credits and odd test amounts are dropped and counted in `excluded.abnormalIncome`.
  **Admin/test accounts are NEVER counted (income and expense):** all `ADMIN_EMAILS` users plus optional `SUMMARY_EXCLUDE` (emails/ids) are dropped from both sides, the message says so with a count of dropped rows, and the job fails closed (no send) if no admin can be identified. On the real data of 18–22 Nov this removed everything except one 50 THB top-up of another user.
  Duplicate guard in the database: **MIGRATION `0018_daily_finance_summary.sql`** (table `daily_finance_summaries`, RPC `claim_daily_summary` / `finish_daily_summary`); without it nothing is sent and the admin is alerted. A failed LINE push is marked 'failed' and may be re-claimed.

- **"โค้ดลับจากแม่มู" voucher codes for live streams (code done 2026-11-23, awaiting owner review):** **MIGRATION `0019_voucher_codes.sql`** (tables `voucher_codes` [code UNIQUE A-Z0-9-, coins ≤10,000, max_redemptions ≤10,000, redeemed_count, expires_at, is_active, note, created_by — NO policy: players can never list codes] and `voucher_redemptions` [UNIQUE (voucher_id, user_id) = 1 use per account; RLS read own], ledger reason `voucher`, RPC `redeem_voucher(user, code)` under voucher-row then wallet-row locks: NOT_FOUND / DISABLED / EXPIRED / ALREADY_USED / FULL).
  `POST /api/voucher/redeem` ({code} only, rate-limited 8/min, `src/lib/voucher.ts` normalises: NFKC, no spaces, upper-case); admin: `/admin/vouchers` (create with generated or typed code, coins, total uses, expiry in Bangkok time, on/off, usage history with emails) → `POST /api/admin/vouchers` and `/api/admin/vouchers/[id]`. Voucher coins are ledger `voucher`, never a `transactions` row, so they never enter the daily income summary.
  UI: `VoucherTrigger` — compact card on the home page above the game cards, inline button on /topup; the modal is top-anchored on phones (keyboard-safe), z-[65] above the LINE button, blocks the cat-game surprise while open, updates the header badge via `walletBus.set`.

- **"เปิดหีบมนตรา" Mystic Chests (code done 2026-11-23, awaiting owner review):** 3×3 = 9 chests, 1–3 cursed chests, bets 10/20/50/100, each safe chest raises the multiplier, cash out any time after the first safe chest, **house edge 10%** (multiplier after k safe = floor(9000·Π(9−i)/(9−m−i)) bp, so every stopping strategy returns ~90% before rounding/cap), **max payout 5,000 per round**, no round limit.
  **MIGRATION `0020_mystic_chests.sql`** (after 0019): table `mystic_chest_rounds` (cursed positions `mine_mask` — NO policy, only service_role can read; one ACTIVE round per user via a partial unique index), ledger reasons `mystic_bet` (−bet at start) / `mystic_win` (+payout), RPCs `mystic_start` (charge + create, route passes a crypto mine mask), `mystic_open` (mine = lost; all safe or cap reached = automatic payout), `mystic_cashout` (pays once). Lock order round → wallet. Nothing is written to `transactions` / `withdrawal_requests`, so the daily income/expense summary is untouched.
  Code: `src/lib/mystic/{config,draw,model,types}.ts` (the SQL multiplier table is pinned to config.ts by a test that parses the migration; `model.ts` = reference model of the 3 RPCs), `POST /api/mystic/{start,open,cashout}`, page `/mystic-chests` (protected prefix; reads the unfinished round on the server WITHOUT mine_mask), `MysticGame`, `MysticRules` (RulesGate `mystic-chests`), home card. The cursed positions are never sent to the browser while a round is active.
  Audit 2026-11-23: after an error / lost answer the client re-reads the truth from `GET /api/mystic/state` (`src/lib/mystic/server.ts` `loadMysticState`, also used by the page); `mystic_payout` returns 0 for an impossible k (least() ignores NULL); hero shows a still (`public/images/mystic-chest-still.jpg`) under reduced motion. **SQL smoke test: `supabase/tests/0020_mystic_smoke_test.sql`** (run in the SQL editor after 0020; one DO block that rolls everything back and reports ALL PASSED / FAIL:).
  A GET route handler that reads cookies must call `await connection()` first, otherwise `next build` prerenders it (it ran the LINE alert path at build time).
  Art: `public/mystic-chest.gif` (640×360, 30 frames, 3.4 MB) is the hero picture of the game (plain `<img>`, shrinks to a thin banner during a round); `public/images/mystic-chest-tile.jpg` (35 KB) is a still crop of its first frame used for the 9 chests (9 animated GIFs would be too heavy). Layout is tuned so hero + board + stats + cash-out fit one 375×812 screen without touching the floating LINE button.
  Reveal art/animation (2026-11-23): `ChestTile.tsx` shows `mystic-gem-tile.jpg` / `mystic-curse-tile.jpg` (384px crops of `public/mystic-gem.jpeg` / `mystic-curse.jpeg`, originals untouched) — gem pops in (spring), glows, floats, twinkles, with a multiplier+coins badge on the last opened chest; the curse seal pops in, shakes once and flashes violet-red. Loops are CSS keyframes in `globals.css` (`.mystic-*`, transform/opacity only, switched off under `prefers-reduced-motion`); one-shot pops are framer-motion with `will-change` only while running. NOTE: after appending to `globals.css`, a stale `.next/cache` once kept the old compiled CSS — `rm -rf .next/cache` and rebuild if new CSS classes don't appear in `next build`.

## Pre-launch checklist (before real customers pay)
1. **Switch slip verification to live** in `.env.local` / the hosting env — delete the `SLIP_PROVIDER=mock` line (and its
   comment) and set:
   - EasySlip (default): `SLIP_API_KEY`. Or SlipOK: `SLIP_PROVIDER=slipok`, `SLIP_API_KEY`, `SLIPOK_BRANCH_ID`.
   - `PROMPTPAY_RECEIVER_NAME` (exactly as the bank prints it on slips) and `PROMPTPAY_RECEIVER_ACCOUNT` (phone/account
     digits). Without a receiver, real slips are refused (NOT_CONFIGURED) on purpose.
   - Optional: `SLIP_MAX_AGE_HOURS` (default 24); `PROMPTPAY_ID` for a dynamic QR with the amount embedded
     (it takes priority over the static QR image).
2. Restart the server after removing env lines, then test one real small transfer (e.g. the 50฿ package) end to end,
   and re-send the same slip to confirm "already credited".
3. In EasySlip's dashboard register the receiving account if using `matchAccount`.
4. Rotate secrets that appeared in chat: the Gemini key, and check the Anthropic key was only ever put in `.env.local`.
5b. REQUIRED for withdrawals: run `0005_jackpot_withdrawals.sql` and set `ADMIN_EMAILS`.
5. REQUIRED: run `supabase/migrations/0004_wheel_paid_jackpot_cycle.sql` (the wheel needs it). Phase 6 code is done (see Status).

- **"วงล้อไต่ชั้น" Power Wheel Climb (code done 2026-11-23, awaiting owner review):** a NEW game separate from the lucky wheel (no free tickets, no jackpot counter, no withdrawal flow; prizes go to the coin wallet only). Bets 10/20/50/100, **house edge 10%** (every stopping strategy returns ~90% before rounding/cap), **max payout 3,000 per round** (was 5,000 at first), no round limit.
  A 10-slice wheel, 12 levels; level k has `DANGER[k-1]` danger slices (1,1,2,2,3,3,4,4,5,5,6,6, placed by `DANGER_ORDER`). Safe slice = climb, danger slice = round lost; stop and take the coins any time after clearing ≥1 level; top level or the cap pays automatically.
  Multiplier after k levels = floor(9000·10^k / Π(10−danger_i)) bp (level 1 = ×1.00 … level 12 = ×246.05). **MIGRATION `0021_power_wheel.sql`** (after 0020): table `power_wheel_rounds` (no policy, one ACTIVE round per user via a partial unique index), ledger reasons `power_bet` (−bet) / `power_win` (+payout), RPCs `power_start` / `power_spin` / `power_stop` (lock order round → wallet).
  The route draws ONLY the slice (0..9, crypto); `power_spin` decides safe/danger from the round's level in SQL, so the caller can't pick the outcome. Nothing is written to `transactions` / `withdrawal_requests`, so the daily income/expense summary is untouched.
  Code: `src/lib/power-wheel/{config,draw,model,types,server}.ts` (the SQL tables are pinned to config.ts by `power-wheel.test.ts`; `model.ts` = reference model of the 3 RPCs + a seeded simulation), `POST /api/power-wheel/{start,spin,stop}` + `GET /api/power-wheel/state` (resync after errors), page `/power-wheel` (protected prefix, RulesGate `power-wheel`), `PowerWheelGame` + `ClimbWheel`, `PowerWheelRules`, home card. **SQL smoke test: `supabase/tests/0021_power_wheel_smoke_test.sql`** (run after 0021; expect an "error" starting with `ALL PASSED`). The SQL itself has NOT been run against a real DB.
  Wording (2026-11-23): this mode never says "แจ็กพอต" and has no withdraw button; the cap is called "โบนัสสูงสุดต่อรอบ (3,000 เหรียญ)", prizes are "รางวัลสะสมเข้ากระเป๋าเหรียญ" with a confirmation line after a payout, and the rules state the coins are in-system only.
  UI (2026-11-23): `ClimbWheel.tsx` reuses the main wheel's look (bevelled gold rim with gem studs, velvet/sapphire slices with sparkles, ruby 💀 slices, medallion hub, crown pointer, `.fw-*` aura/ember CSS, `cw-` gradient ids); game screen = wheel + a compact status card (level / power ×N / coins, one-row progress bar) + two big buttons "หมุนไต่ชั้นถัดไป" / "รับเหรียญขั้นนี้"; the 12-level multiplier table is folded in a `<details>`.

- **Share-the-site button + page toolbar (2026-11-25):** `PageToolbar` (root layout, under the header) = "← กลับหน้าหลัก" (hidden on `/`) + `ShareLinkButton` ("🔗 แชร์เว็บ", all pages). The share link is ALWAYS the site origin (`mainShareUrl()` in `src/lib/share-link.ts`: `NEXT_PUBLIC_APP_URL` else `location.origin`; path/query/hash stripped), never a game page. The panel offers แชร์ (Web Share API when available), คัดลอกลิงก์ (Clipboard API → select+execCommand → manual hint) and เปิดในเบราว์เซอร์, with a status line and a notice when direct sharing is unsupported. Pure client UI: no API call, no wallet/game-round/DB access.

- **Wheel final tick + check-in streak (2026-11-25):** `FantasyWheel` — same ease-out with a slightly longer, slower tail (`[0.14,0.88,0.1,1]`; the last 15% of the distance takes ~77% of the spin, was ~71%; total duration and landing unchanged); when `FINAL_PEGS` (3) slices remain the crown pointer lights up (opacity of an outline + halo only, no filter/shadow) and its tick is heavier; the glow lingers 0.5 s on the landing. Check-in streak = consecutive Bangkok days from the existing `daily_checkins` rows (`src/lib/wheel/checkin-streak.ts`, counts from today if checked in, else from yesterday); the page reads the last 400 rows once (also gives today's state) and `WheelExperience` shows a "🔥 เช็กอินต่อเนื่อง N วัน" chip + a nudge above the check-in button, +1 on a successful check-in. Display only: no new reward, no SQL.

- **Lucky card pick teaser (2026-11-25):** a themed line (6 variants, by round counter) + "ผลรางวัลสุ่มโดยระบบ ไม่ว่าจะเลือกไพ่ใบไหน" above the 8 cards while picking; after a pick the other cards dim to 35%. The "reveal the other cards" idea was declined again on purpose: one server roll per round means the other cards have no outcome of their own, so any prize shown on them would be invented (and misleading for a game with a real-money prize). It would need the server to draw all 8 cards — a change to the draw rules the owner has not asked for.

- **Cat game suspense + daily-right status (2026-11-25):** the reveal waits until `SUSPENSE_MS` (500 ms; 150 ms under reduced motion) after the tap (errors never wait); a "🎟️ สิทธิ์วันนี้" chip shows ready (1/1) or used (0/1) with a live HH:MM:SS countdown to the 00:00 Bangkok reset (`src/lib/cat-game/countdown.ts`; at zero the page re-reads the server state). After a win a ladder of the 5 public prize levels lights the one won and fades the other four. Showing amounts on the OTHER cats was declined on purpose: one draw per play, the other cats hold nothing, so any amount shown there would be invented.

- **Mystic Chests ajar-lid peek + stack panel (2026-11-25):** after a tap the chest shows a slit of golden light and a soft glow (`ChestTile`, transform/opacity only) and the reveal waits until `PEEK_MS` (450 ms; 120 under reduced motion) after the tap — identical for a safe and a cursed chest, so it never hints at the result; the tap lock (`inFlight`) and the other chests / the cash-out button stay locked until then (an error never waits). The active-round panel is now: big "ยอดสะสมตอนนี้" + multiplier, a bet/cursed/progress line, and two choice boxes "✋ หยุดตอนนี้ รับ N แน่นอน" / "🎲 เปิดต่อ · รอด X% ได้ M หรือเสียหมด" (X from the public odds `(9−mines−k)/(9−k)`); the balance row is hidden during a round and the hero is thinner so the cash-out button stays above the floating LINE button at 375×812.

- **Power Wheel next target + level pitch (2026-11-25):** the status card shows "🎯 ถ้าผ่านชั้นถัดไป ไปที่ N (+Δ)" and "🏁 เพดาน 3,000 อีก M เหรียญ" (or "ชั้นหน้าถึงเพดาน จบรอบ จ่ายเอง" when `reachesCap(bet, level+1)`); numbers come from the same multiplier table / cap as the SQL, display only. `powerSfx.spin(secs, pegs, level)` and `reward(tier, level)` pitch the tick / coin-clink / chime frequencies by `pitchFor(level)` = 2^(level/48) (≈ +3 semitones at level 12, `src/lib/power-wheel/sfx-pitch.ts`); loudness is unchanged (offline-rendered peaks 0.10–0.28 at L1 and L12). `climb(level)` already rose a semitone per level.

- **Power Wheel setup order (2026-11-25):** in the pre-round card the order is bet chips → "เริ่มไต่ชั้น" button (h-14) → the long explanation, so on a 375×812 phone the start button sits at y≈650–706 right under the wheel, clear of the floating LINE button (y≥742); the not-enough-coins top-up button takes the same slot. Only the order changed.

- **Power Wheel active-round order (2026-11-25):** during a round the order is wheel → "หมุนไต่ชั้นถัดไป" (h-14) → "รับเหรียญขั้นนี้" (h-12) → the stats card (level / power / coins / next target / cap distance). At 375×812 the spin button is at y≈525–581 and the stop button at y≈591–647, both above the floating LINE button (y≥742). Only the order changed.

- **Power Wheel "level jumps back" fix (2026-11-26):** the DB can't go down (the only two writes of `power_wheel_rounds.level` in `power_spin` set `level + 1` under the row lock), so the bug was client-side: `PowerWheelGame` started from the `initialRound` props of a server render that can be OLD (page restored from the browser's back/forward cache, e.g. after "กลับหน้าหลัก"/Back) and `resync()` could overwrite newer state with a late answer. Reproduced with a mock (props level 3, server level 5 → the screen showed 3 until the next spin, then jumped). Fix: the game reads `/api/power-wheel/state` on mount, on `pageshow` (persisted) and when the tab becomes visible again; every state read is dropped if a start/spin/stop began after it (`mutationSeq`) or one is running, and `reconcileRound()` (`src/lib/power-wheel/reconcile.ts`, tested) refuses an older level / a finished round coming back to active for the same round; the state route sends `Cache-Control: no-store`. The same pattern would suit MysticGame if it ever shows the same symptom (it already resyncs from `/api/mystic/state` after errors but not on mount).

- **Birthdate reading follows the real moment (2026-11-26):** every `POST /api/fortune/birthdate` now puts the CURRENT Thai date/time (from the SERVER clock, `thaiNow()` in `src/lib/astrology/now-th.ts`: weekday, date, พ.ศ., HH:MM, day part, and the astrological day running now — new day at 06:00, Wednesday night = ราหู) into the prompt, plus where today's day falls on THIS person's ทักษา wheel (`todayRelation()`, with a short meaning per position and favourable/supportive/caution tone), a birthday-today note, and a per-request random opening + lens (`variety.ts`, `crypto.randomInt`) because Claude Opus with thinking takes no sampling temperature. New output sections after the base-chart ones: ดวงวัน{weekday}นี้ ช่วง{dayPart} · อะไรเด่นช่วงนี้ · อะไรดับหรือควรระวังช่วงนี้ · สีมงคลและเลขมงคล · คำแนะนำเสริมดวงจากแม่มู (650–850 words; Gemini max output 6,144 tokens). The prompt forbids inventing วันพระ/ข้างขึ้นข้างแรม/planet transits/ฤกษ์ (none are computed). Nothing caches readings (the route always generates; `fortune_logs` is only a log) and the response is `Cache-Control: no-store` with `asOf` shown on the result card ("ตรวจตามเวลา …"). `ageOn()` and the future-birthdate check now use the Bangkok calendar date (a UTC server read the date 7 h late, so the age could be a year off around the birthday between 00:00 and 07:00 Thai time). Charging / free ticket / refund untouched. The tarot reading has its own prompt and was NOT changed.

- **Tarot 3-card reading follows the real moment (2026-11-27):** the prompt moved out of the route into `src/lib/tarot/prompt.ts` (`buildTarotPrompt`, pure, relative imports so vitest can load it). The three cards and their positions (อดีต · ปัจจุบัน · อนาคต) and `drawThree()` are unchanged. The prompt now adds the CURRENT Thai date/time from the SERVER clock (`thaiNow()`, plus the day colour), a per-request random opening + lens (`pickTarotVariety`, `crypto.randomInt`), new sections (จังหวะเวลานี้กับไพ่ทั้งสามใบ · สิ่งที่ควรทำในจังหวะนี้ · สิ่งที่ควรหลบหลีกหรือระวังในจังหวะนี้, before คำตอบจากแม่มู and the closing คำแนะนำเสริมดวงจากแม่มู), and a closing paragraph about "การสวดเสริมดวงชะตากับแม่มูแซนดี้" whose tone follows the cards as the AI reads them (heavy → clear obstacles / lighten the load; good → boost and keep the luck; mixed → follow the present + future cards). The cards carry no good/bad metadata, so the AI judges from the meanings it is given. Guardrails written into the prompt (the owner did not ask for them): the prayer is only an option, no pressure or urgency, no "if you don't, something bad happens", no promised results, and no price / channel / terms are invented (none exist in the app — add them to the prompt if the owner wants a booking path). 550–750 words. Nothing caches readings (the route always generates); the response is `Cache-Control: no-store` with `asOf`, shown on the result card ("อ่านไพ่ตามเวลา …"). Charging / free ticket / refund / the draw / the card display are untouched. Not run against the real AI or checked in the browser (needs login + coins).

- **Read-aloud hardening (2026-11-28):** mechanism = Web Speech API (`speechSynthesis`, device Thai voice) via `src/lib/tts/{speech,useReadAloud,thai-text}.ts` + `ReadAloudControl`; it starts on mount of the result view (tarot: after the 3 cards flipped and the reading arrived; birthdate: when the result shows), unlocked by a silent utterance on the last tap (`unlockSpeech()`, now a real "." character at volume 0 — WebKit may not count a bare space). Weak spots fixed for mobile browsers (could not be reproduced on desktop Chromium, which starts fine even without user activation): `cancel()` immediately followed by `speak()` (Chrome on Android drops it) → the hook waits `CANCEL_SETTLE_MS` (120 ms) only when something was queued; a leftover paused queue (`cancelSpeech()` now also resumes); the Thai voice list filling late (`waitForThaiVoice()` polls up to 4 s instead of giving up at 2 s and showing a permanent "no Thai voice"); a silently dropped or `not-allowed` speech (a 2.5 s start watchdog + the error event set status `blocked`: the main button becomes a highlighted "แตะเพื่อฟังแม่มูอ่านคำทำนาย" with an explanation; a tap is a user gesture so it plays); the no-voice state now has a "ลองใหม่" button. The remembered auto-read switch (speaker icon) is respected: muted = no autoplay, manual play still works. Verified with the real macOS Thai voice plus fake blocked / not-allowed / late-voice / no-voice / muted scenarios in the browser pane; a real iOS/Android phone has not been tried.

- **Read-aloud, second pass (2026-11-28) — "tapped the button, still no sound":** the 2.5 s start watchdog added in the first pass CANCELLED speech that was merely slow to begin (cloud / compact mobile voices can need several seconds for the first sound), so every tap was killed and re-blocked forever; and a voice that errored (`synthesis-failed`, `network` — the scorer prefers the Google cloud voice) just reset to idle silently. Now `useReadAloud` tries the Thai voices best-first (`getThaiVoices()`): a slow start is WAITED for (the engine holding the queue = `speaking || pending`, up to `STALL_MS` 10 s), a voice that errors / stalls is skipped for the next one, a silent DROP of an automatic start still becomes the "tap to listen" `blocked` state (1.5 s check), and when every voice fails the status is `failed` with the error code shown ("รหัส: synthesis-failed") plus an iPhone silent-switch hint and a retry button; taps call `play(true)`. The tarot page now calls `unlockSpeech()` on the "เริ่มเลือกไพ่" tap and on EVERY card pick (was: only the 3rd). Verified in the browser pane with the real macOS Thai voice and simulated slow-start (4 s), first-voice-error, all-voices-failed, silently-dropped and normal (pause/resume) scenarios; NOT tried on a real iPhone/Android — if sound is still missing there, the `failed` box's error code (or its absence) is the clue.

- **Read-aloud, third pass — "synthesis-failed" regression (2026-11-28):** the second pass made the tarot page call `unlockSpeech()` on the start tap and on every card pick (4 silent `.` utterances with `lang=th-TH` left in the queue); the reading then had to cancel them and a cloud/mobile Thai voice failed with `synthesis-failed`. Fix: `unlockSpeech()` is back to ONE silent `" "` utterance (no forced lang, skipped if the engine is already busy) on the LAST card pick only; `CANCEL_SETTLE_MS` 120 → 250; `useReadAloud` retries a voice once after 500 ms when it fails with `synthesis-failed`, then falls through the voice list and finally to the browser's default Thai voice (`voice = null`). Draw, prompt, coins, DB untouched. Not re-tested on a real phone.

- **Read-aloud, fourth pass — speech text vs screen text (2026-11-28):** the screen still shows the full reading; only the text sent to the voice changed. `normalizeForSpeech` now removes everything but Thai, Latin letters, digits and basic punctuation (emoji, arrows, stars); phrases are ≤ 100 chars (was 140); `toSpeechPhrases` stops at a phrase boundary after `MAX_SPOKEN_CHARS` (4,000). `speakWith` feeds the engine 4 utterances at a time (the next one is queued from `onend`) instead of 100+ at once, because the longer time-aware readings overloaded mobile engines. Tests in `thai-text.test.ts`.

