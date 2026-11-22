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
  **Admin reset (2026-11-22): `/admin/cat-game` (admin-only) looks a player up by exact email/id and gives today's chance back — `POST /api/admin/cat-game/{lookup,reset}` → RPC `admin_reset_cat_game` (MIGRATION `0017_cat_game_admin_reset.sql`, after 0016): deletes only today's `cat_game_plays` row, audits it in `cat_game_admin_resets`, never touches wallet/ledger.**
  **Surprise pop-up (2026-11-22):** on the home page only (`CatSurpriseGate` in `src/app/page.tsx`, reads wallet + today's play) a modal appears when the balance is 9–50 coins and today's play is unused ("offer"; 50 = one wheel spin, updated 2026-11-22), or 0–8 coins ("low": needs ≥ 9 to start, top-up link). Rules in `src/lib/cat-game/surprise.ts`;
  a dismissal is kept in sessionStorage per user + state + Bangkok day (no re-pop). The pop-up only advertises the game — the server does NOT limit play by balance.

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
