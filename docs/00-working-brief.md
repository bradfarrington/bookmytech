# Book My Tech — Project Working Brief

*Customer, Mechanic and Operations Journey · Platform Scope · Phased Build Plan*

Book My Tech (BMT) is a two-sided marketplace that connects car owners with vetted mobile mechanics. A customer enters their registration plate, picks a service, sees a fixed price, and books a vetted mechanic to come to their door — the entire booking takes under sixty seconds. The platform replaces the opaque pricing, slow phone-and-quote loops and lack of operational oversight that define the current UK mobile-mechanic market.

This brief sets out the full scope of the platform across the three connected applications — customer, mechanic and admin — and the recommended phased build plan to take it from MVP to scale.

| Area | Summary |
| --- | --- |
| Single platform | Three applications — customer, mechanic and admin — built on one shared data model with role-gated routes. |
| Booking core | 60-second booking flow with DVLA reg lookup, fixed transparent pricing, and matched mechanic by proximity, specialism and rating. |
| Mechanic side | Live job feed with accept/decline, day schedule, in-progress checklist, earnings dashboard and document-verified onboarding. |
| Operations console | Live job monitor, demand-vs-supply heatmap, mechanic approvals, pricing controls and analytics — single ops view. |
| Commercial model | Per-service commission rate set in admin console, area-based labour pricing, Pro-tier loyalty, and parts-margin layer wired in from day one. |
| Build approach | Five-phase plan: MVP launch (Wks 1–6), mechanic mobile + automation (7–10), commercial levers (11–14), retention (15–18), scale (19+). |

## 1. Context and purpose

The UK mobile-mechanic market is fragmented. Around 70% of customers abandon a quote because they cannot see the total before booking. The average phone-and-quote loop pushes confirmation out by three days or more. Independent mechanics lose roughly 30% of their week to admin and dead leads. And operators only see jobs after the fact — there is no live demand map, no mechanic supply view, and no visibility on bottlenecks until they have already cost money.

Book My Tech replaces all of that with a single platform where bookings happen in seconds, mechanics fill their day with profitable jobs, and the operator watches the marketplace run from one dashboard. The system needs to feel as simple as Uber for the customer, as profitable as a well-managed round for the mechanic, and as observable as a live ops console for the team running it.

The early target metrics frame the design. Time from reg plate to booked should be sixty seconds. Mechanic utilisation should improve by a factor of 3.4×. Repeat-customer rate should hold at or above 42% within ninety days of launch. Default take-rate is 15%, with area multipliers protecting margin in premium postcodes. Average mechanic time-to-accept on a new job offer should sit under sixty seconds.

## 2. Platform structure and applications

The platform is composed of three interconnected applications, all built on a shared data model and a single auth system with roles. Customers interact through a responsive web app — desktop homepage and mobile-first booking flow. Mechanics use a desktop web dashboard for back-office work and a phone-optimised mobile app for live jobs in the field. The operations team uses a desktop-only admin console for monitoring, approvals, pricing and analytics.

Although the three surfaces look different, they read from the same underlying tables — bookings, mechanics, payments, reviews and so on. This means a status change in one place propagates immediately. When a mechanic accepts a job, the customer sees the live tracking card update, the admin sees the live monitor flip, and the payment record links cleanly across all three views.

| Application | Users and surface |
| --- | --- |
| Customer App | Car owners. Responsive web — desktop homepage with reg-plate lookup hero; mobile-first four-step booking flow. |
| Mechanic App | Independent mobile mechanics. Desktop web dashboard for KPIs, schedule and earnings; mobile app for live jobs and in-progress workflow. |
| Admin Console | BMT operations team. Desktop-only ops view with live monitor, approvals queue, pricing controls and analytics. |

## 3. Customer journey

The customer journey is built around the principle that a booking should feel instant. The desktop homepage opens with a dark gradient hero, headline copy, and an inline reg-plate plus postcode lookup field. The moment a postcode is entered, the customer is taken into the booking flow. Mechanic selection is handled automatically on the backend after the booking is placed. A trust strip running below carries four badges (4.9-star average rating, vetted professionals, same-day availability, twelve-month guarantee), followed by a four-step "how it works" guide and three featured customer testimonials.

From there the customer moves into the mobile-first booking flow, which is structured as four steps with a progress stepper at the top of each screen and one decision per screen. The first step captures the vehicle through a UK-style number plate input — yellow background, GB badge — and DVLA auto-lookup pulls in make, model, engine, fuel type, year, MOT status, tax status and estimated mileage. The detected vehicle is shown in a highlighted card with a green check, and an "edit manually" fallback link covers edge cases.

The second step is service selection. A search bar leads a six-category grid — full service, diagnostic (highlighted as the most-picked), brakes and tyres, battery, clutch and gears, and MOT pre-check — each with a starting price. A "not sure what's wrong?" card sits below as a soft entry point into the diagnostic flow. The third step shows the price and what is included. A large gradient blue hero card displays the fixed price, the service name, and what is included (parts and labour, no call-out fee, twelve-month guarantee), alongside a transparency note clarifying that a deposit is pre-authorised at booking and is only released once the job is complete and the customer has signed off. No money leaves the customer's account until the work is done. No mechanic is shown at this stage — the customer does not choose their mechanic. Once the booking is confirmed, the job is distributed on the backend to available mechanics in the area; the first to accept is assigned. The customer receives an email confirmation as soon as a mechanic accepts, at which point the mechanic's details are visible on the customer dashboard.

The final step is the time slot. A horizontal date strip shows five days with available slot counts; a three-column time grid below shows the open times with "Popular" and "Last" badges. The customer's address is pre-filled in a card with parking type and special instructions, and a sticky CTA bar at the bottom shows the total to pre-authorise and a single confirm button. The intent throughout is to keep the customer moving — short copy, generous whitespace, no hidden fees, total surfaced early.

Post-booking, the customer lands on a confirmation screen with the booking ID, mechanic contact card, full booking summary and a live tracking notice that activates closer to the slot time. From the customer dashboard they can see a real-time job card with mechanic ETA and a map preview, upcoming bookings, and past jobs with one-tap rebook. After completion, the review screen prompts a star rating with quick-tag chips (friendly, on time, tidy work, explained clearly, great value, quick) and an optional free-text field.

## 4. Mechanic journey

The mechanic side is split between a desktop web dashboard for the back-office work — earnings, schedule, profile, documents — and a phone-optimised mobile app for live work in the field. Both read from the same data, but each is shaped for its context.

The desktop dashboard opens onto live jobs. Four KPI cards across the top show today's earnings, jobs this week, acceptance rate and customer rating. Below sits a new-jobs feed — live offers within the mechanic's configured radius, each showing service, vehicle, area, distance, scheduled time, earnings amount and an expiry countdown — with accept and decline buttons per job. A daily schedule timeline runs alongside, showing confirmed jobs with status dots (done, next, future, buffer), locations and earnings per job. A service-area map visualises the radius circle with customer dots and active mechanic count, and a weekly earnings chart breaks earnings down by day with a previous-week comparison. A "Pro tier progress" incentive card sits in the corner — for example, "you're three jobs from Pro tier."

The job detail view opens when a mechanic clicks into an offer. It shows a status pill, the service headline with vehicle and mileage, four info tiles (when, distance, estimated time, and what the mechanic earns), the customer's notes verbatim, any photos the customer uploaded, and the parts allocated for the job with supplier and cost. An earnings breakdown shows the full chain — what the customer pays, parts cost, platform fee, and what the mechanic receives — alongside a "why you're a great match" reasons card explaining how the system picked them.

The earnings and payouts view shows monthly KPIs, a thirty-day earnings chart with period selectors, and a recent payouts table with masked bank details and paid/pending status. The availability and service area screen lets mechanics set their working hours day-by-day, adjust their service radius from two to twenty miles via a slider with a live map preview, and toggle their specialisms on a grid (brakes, suspension, diagnostics, battery, service and MOT prep, clutch, cambelt, air-con regas), each tile showing a job count to indicate demand.

On the mobile side the mechanic uses a bottom-tab navigation — jobs, schedule, earnings, reviews, me. The day view leads with a greeting and daily summary (e.g. "three jobs lined up · £284 booked"), a circular earnings goal ring showing progress against a daily target, and an up-next list of scheduled jobs. When a new job offer arrives, an urgent notification bar surfaces with an expiry countdown, an earnings highlight card showing the gradient blue payout, four info tiles, and accept/decline buttons. Once a job is in progress, the screen flips to a five-step checklist — on the way, inspection, work in progress, quality check and cleanup, complete and charge — with the customer signing off in-app and the payout timing made explicit ("paid 24h after sign-off").

## 5. Operations console

The admin console is desktop-only and built around a dark sidebar with three navigation groups. Operations covers the overview dashboard, all jobs, the live monitor and disputes. Network covers mechanics, approvals and documents. Commercial covers pricing, areas and demand, and analytics. A global ⌘K search bar and a notification bell sit in the top bar.

The overview dashboard is the team's home screen. Five KPI cards run across the top — live bookings, GMV today, take-rate, mechanics online, and average time-to-accept. A live monitor table below shows every active booking in real time with ID, service, customer, mechanic, area, status (en route, in progress, sourcing mechanic, complete) and value. A "needs your attention" panel surfaces flagged items — undersupplied areas, mechanic performance flags, open disputes — and a horizontal demand-by-area bar chart shows job volume against mechanic supply per zone, with warnings on undersupplied postcodes.

Job monitoring expands the live view into a full filterable table — date range, area, service type, mechanic, status — with tabs for all, live, pending, complete and disputed jobs, plus export and manual booking buttons. Mechanic approvals uses a queue/detail split view: oldest applications first, with a verification checklist (ID, public liability insurance, trade insurance, trade qualification, bank and VAT, two references), each item with a status indicator and a "view" button, plus an auto-screen summary note and approve/reject/override buttons. The admin can override any outstanding queries and approve the mechanic immediately, granting a 28-day grace period in which the mechanic must supply any missing documents. Mechanics with documents outstanding beyond that grace period are automatically suspended from the distribution until they comply.

Pricing controls let the team edit base service prices, commission rates per service, area labour multipliers (London Z1–Z2 at ×1.15, rural at ×1.10, etc.), cancellation fee tiers (before 24 h: £0; within 24 h: £30; mechanic already on the way: £50 — all configurable), and dummy parts pricing by area for development (to be replaced by a live API later). Surge pricing has been removed from the platform. The disputes section shows all open disputes across the platform. Disputes are visible to the admin and to the mechanic assigned to the disputed job — the admin monitors all correspondence but acts only as mediator and only gets involved if the parties cannot resolve it themselves. The admin can suspend mechanic accounts from the live distribution with a reason and a time frame, which immediately removes them from all new job offers until the suspension is lifted. The analytics view runs on period selectors (7d, 30d, 90d, year), with KPI cards for GMV, net revenue, bookings and repeat rate, a GMV trend chart with prior-period overlay, a service mix breakdown, ranked top areas and top mechanics, and a five-stage conversion funnel from reg lookup started through to booked.

## 6. Commercial model

Commission is set per service in the admin console, so different service types can carry different rates. Pro-tier mechanics earn a lower commission as a loyalty incentive. Area-based labour multipliers apply by postcode — premium areas at ×1.05–1.15, growth areas subsidised below the base rate. Parts pricing is area-specific and will be pulled from an API in production; dummy data is used during development. Surge pricing has been removed from the platform. Featured listings give mechanics a paid path to priority placement in customer-facing results.

**Payment model:** at booking a deposit is pre-authorised on the customer's card. The payment remains pending until the mechanic marks the job complete, at which point the funds are released and split between the platform (commission) and the mechanic (remainder). If a mechanic cancels and the job is redistributed, the original pending payment is held and transferred to the replacement mechanic's details once the new job is complete, avoiding a second charge to the customer.

**Cancellation fees:** if the customer cancels more than 24 hours before the appointment there is no charge. If they cancel within 24 hours the fee is £30. If they cancel after the mechanic is already on the way the fee is £50. All three thresholds are configurable in the admin console.

The data model is wired from day one to support future revenue layers — parts margin, B2B fleet contracts, insurance and warranty partnerships — so these can be turned on without re-platforming.

| Lever | Detail |
| --- | --- |
| Commission per job | Configurable per service in admin console. Lower for Pro-tier mechanics as a loyalty incentive. |
| Area labour multipliers | Postcode-based: ×1.05–1.15 in premium areas, subsidised in growth areas. |
| Parts pricing | Area-specific; dummy data for development, live API in production. |
| Cancellation fees | >24 h: £0 · within 24 h: £30 · mechanic on the way: £50 — all configurable. |
| Featured listings | Paid placement for mechanics seeking priority in customer results. |
| Future levers | Parts margin, fleet contracts, insurance partnerships — all data-modelled from day one. |

## 7. Design system and UX principles

The brand sits in the professional, modern, frictionless and trustworthy register. The primary blue is `#2563EB` with a darker variant at `#1E3A8A` and a brighter accent at `#3B82F6`. Typography is Inter on web and SF Pro on iOS — clean, modern sans-serif. The system uses a 12-column grid with a 1200px max content width, mobile-first at 375px, and a strict spacing scale of 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 pixels — no arbitrary values.

Component patterns are consistent across all three applications. Cards sit on a white surface with a 16px radius and a soft `0 4px 20px rgba(0,0,0,0.05)` shadow. Buttons are 10px radius with 12px / 20px padding, primary in solid blue, secondary in outlined blue. Inputs are 48px tall with an 8px radius, focused state showing a blue border and soft outer shadow. Tags and labels are pill-shaped at 999px radius, with light tinted backgrounds and matching coloured text — active in blue, success in green, pending in amber, error in red.

The UX principles run through every screen. Booking must feel instant. No screen should ask for more than one decision. Progress is always shown as step 1 of 4 with a bar. Pricing is surfaced early with no hidden fees. The whole experience is designed mobile-first, with generous whitespace, short copy and clear hierarchy to keep cognitive load low.

## 8. Tech stack and integrations

The recommended stack pairs Next.js on the front end — both customer and admin in the same app, role-gated by route — with Supabase for database, auth, edge functions and realtime updates. The mechanic mobile experience is delivered as a PWA in phase one, with React Native on the table if a native shell is needed later. Stripe Connect handles the marketplace payment flow, including pre-authorisation at booking and capture on completion, with mechanic payouts running on the same rails.

Vehicle data is pulled from the DVLA Vehicle Enquiry Service. Maps, geocoding, distance matrix and live tracking run on Google Maps Platform. Push notifications use Firebase Cloud Messaging via Expo. Transactional email goes through Resend, SMS through Twilio. Hosting is Vercel for the web app and Supabase for the backend, with Supabase Storage handling mechanic verification documents and customer-uploaded photos.

| Layer | Technology |
| --- | --- |
| Frontend | Next.js (React) — single app, role-gated routes for customer and admin |
| Mechanic mobile | PWA (phase one); React Native option for native shell later |
| Backend | Supabase — Postgres, Auth, Edge Functions, Realtime |
| Payments | Stripe Connect — marketplace pre-auth and capture, mechanic payouts |
| Vehicle lookup | DVLA Vehicle Enquiry API |
| Maps and routing | Google Maps Platform — geocoding, directions, ETA |
| Push notifications | Firebase Cloud Messaging via Expo |
| Email and SMS | Resend (email), Twilio (SMS) |
| Hosting and storage | Vercel (web), Supabase (backend), Supabase Storage (documents and photos) |

## 9. Phased build plan

The build is structured in five phases. The intent is to get a working core into market quickly, then layer automation, commercial levers, retention mechanics, and scale tooling on top — each phase ending in something the team can use, sell or learn from.

### Phase 1 — MVP launch (Weeks 1–6)

The goal of phase one is a live core booking loop in London. The customer can book, the mechanic can accept, and the admin can monitor. Weeks one and two cover the project scaffold, Supabase schema, auth across the three roles, DVLA integration, and seeding the service catalogue. Week three delivers the customer booking flow end-to-end. Week four brings up the mechanic web dashboard with live jobs, schedule and earnings. Week five delivers the admin overview, job monitoring and approvals queue with document review. Week six wires Stripe Connect, booking confirmation emails and a staging deploy. Launch criteria: three London boroughs, ten to twenty mechanics, manual onboarding.

### Phase 2 — Mechanic mobile and automation (Weeks 7–10)

Phase two gives mechanics a field-ready mobile experience and automates the dispatch pipeline. Week seven delivers the mobile day view, incoming job offer screen and push notifications. Week eight brings up the in-progress workflow with the five-step checklist, customer sign-off and auto-charge on completion. Week nine introduces smart dispatch — auto-matching by proximity, specialism, availability and rating, with a fallback queue if the first mechanic declines. Week ten lights up the customer dashboard with live tracking, in-app messaging and post-job review prompts.

### Phase 3 — Commercial levers and growth (Weeks 11–14)

Phase three turns on the revenue side. Week eleven delivers the pricing engine — area-based multipliers, admin pricing controls, base rate editor. Week twelve adds surge pricing logic and featured mechanic listings. Week thirteen builds out the analytics dashboard with GMV trends, service mix, conversion funnel, top areas and top mechanics, and repeat-rate tracking. Week fourteen delivers the multi-city expansion tooling — area setup wizard, mechanic recruitment flow, demand heatmaps.

### Phase 4 — Retention and optimisation (Weeks 15–18)

Phase four drives repeat bookings and operational excellence. Week fifteen delivers the customer rebooking flow — one-tap repeat from past jobs, plus service reminders for MOT and service intervals. Week sixteen launches the Mechanic Pro tier with loyalty programme, lower commission rate, priority job access and Pro badge. Week seventeen brings up the dispute resolution system — refund requests, admin arbitration workflow, mechanic performance flags. Week eighteen adds the parts margin layer — BMT-sourced parts catalogue, margin tracking and supplier integration.

### Phase 5 — Scale and future (Weeks 19+)

Phase five opens the platform up to national expansion and new revenue streams. Fleet contracts (B2B pricing for businesses with vehicle fleets), insurance partnerships (warranty and breakdown cover add-ons), calendar sync for mechanics (Google Calendar and Outlook), advanced reporting and financial exports, native iOS and Android apps for customers if PWA proves insufficient, and a partner API for car dealerships and insurance companies.

## 10. Success criteria

- A customer can complete a booking in under sixty seconds from entering their reg plate.
- A mechanic receives and can accept a job offer within five seconds of dispatch.
- Admin can see all live jobs, mechanic supply and demand hotspots in a single view.
- The platform achieves a repeat-booking rate at or above 42% within ninety days of launch.
- Take-rate holds at 15%, with area multipliers protecting margin in premium postcodes.
- Mechanic onboarding from application to approved takes under forty-eight hours, with automated document verification.

## 11. Resolved decisions

The following items were open at the time of the initial brief. All have now been settled with the client.

**Cancellations and rescheduling — customer-initiated**
- If a customer wants to reschedule, they are asked for a reason and rescheduled with the already-assigned mechanic.
- If a customer cancels, they are asked for a reason. Cancellation fees apply based on timing: more than 24 hours before the appointment — no charge; within 24 hours — £30; after the mechanic is already on the way — £50. All fee thresholds are configurable in the admin console.

**Cancellations and rescheduling — mechanic-initiated**
- If a mechanic reschedules, the customer receives a new confirmation and can accept, decline, or request an alternative time. If the customer declines, BMT offers to redistribute the job to another available mechanic.
- If a mechanic cancels, a reason is recorded and saved against that mechanic's job history in both the admin console and the mechanic's own dashboard. The job is immediately redistributed to other mechanics via the standard offer process. The original pending payment is held rather than refunded and cancelled — it is transferred to the new mechanic's payout once the replacement job is complete, avoiding a second charge to the customer. An automated email is sent to the customer explaining that the original mechanic has cancelled and that BMT is finding a suitable replacement; a second email is sent once a replacement has accepted.

**Commission**
- Commission is determined per service in the admin console. There is no platform-wide flat rate.

**Surge pricing**
- Removed entirely from the booking flow and all other areas of the platform.

**Payment model**
- A deposit is pre-authorised (not captured) at booking. The payment remains pending until the mechanic marks the job complete. On completion the funds are released and split between the platform commission and the mechanic payout based on the per-service commission rate and the final job price.

**Mechanic screening and onboarding documents**
- Mechanics are screened on: qualifications, two forms of insurance (trade insurance and public liability insurance), and stated ability/specialisms on their application form.
- Admins can override any outstanding queries in the approvals queue and approve a mechanic immediately, granting them a 28-day grace period to supply any missing documents.
- DBS checks are removed from the platform entirely — mechanics are described as "vetted professionals" in all customer-facing copy.

**Disputes**
- Customers can raise a dispute from their job list on the customer dashboard.
- Disputes are visible to and notifiable to both the admin team and the mechanic assigned to the disputed job.
- The admin sees all correspondence but acts only as mediator — they get involved only if the parties cannot resolve the dispute themselves. BMT is the named mediator.
- The admin can suspend mechanic accounts from the live distribution at any time, with a recorded reason and a defined time frame. Suspended mechanics are immediately removed from all new job offer distribution until the suspension is lifted or expires.

**Pricing by area**
- Each active area has set prices per service. Labour charges vary by area. Parts pricing also varies by area (to be pulled from an API in production; dummy data is used during development).

---

*This brief describes the Book My Tech platform end-to-end. All open items from the initial scoping call have been resolved and are documented in section 11 above.*
