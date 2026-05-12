# Book My Tech — Full Project Overview

> **Purpose of this document:** Provide a comprehensive, self-contained description of the entire Book My Tech platform — what it is, what it does, who it serves, every screen and feature, the business model, and the recommended phased build plan. This document is designed to be pasted into an AI assistant to generate a polished PDF walkthrough and a development roadmap.

---

## 1. What Is Book My Tech?

**Book My Tech (BMT)** is a **two-sided marketplace** that connects **car owners** with **vetted mobile mechanics**. Think of it as "Uber meets Checkatrade for car repair." A customer types in their registration plate, selects a service, sees a transparent fixed price, picks a time slot — and a DBS-checked mechanic comes to their door. The entire booking takes under 60 seconds.

The platform is composed of **three interconnected applications** built on a single shared data model:

| Application | Users | Surface |
|---|---|---|
| **Customer App** | Car owners | Responsive web (desktop homepage + mobile-first booking flow) |
| **Mechanic App** | Independent mobile mechanics | Desktop web dashboard + native-feel mobile web app |
| **Admin Console** | BMT operations team | Desktop-only ops dashboard |

---

## 2. The Problem We're Solving

The UK mobile-mechanic industry is fragmented and analogue:

- **Opaque pricing** — 70% of customers abandon a quote because they can't see the total before booking.
- **Slow matching** — Phone-and-quote loops mean the average booking takes 3+ days to confirm.
- **Mechanic downtime** — Independent mechanics burn 30%+ of their week on admin and dead leads.
- **No live oversight** — Operators only see jobs after the fact. No demand map. No bottleneck visibility.

**Book My Tech replaces all of this with a single platform** where bookings happen in seconds, mechanics fill their day with profitable jobs, and the operator watches a self-running marketplace grow from one dashboard.

---

## 3. Key Metrics & Targets

| Metric | Target |
|---|---|
| Time from reg to booked | **60 seconds** |
| Mechanic utilisation improvement | **3.4×** |
| Repeat-customer rate | **≥ 42%** |
| Default take-rate (commission) | **15%** |
| Average time-to-accept (mechanic) | **< 60 seconds** |

---

## 4. Detailed Feature Breakdown

### 4.1 Customer Application

#### 4.1.1 Homepage (Desktop — `CustomerHomepage`)
A conversion-focused landing page with:
- **Dark gradient hero** with headline, sub-copy and inline reg-plate + postcode lookup field
- **Live mechanic preview panel** — shows real mechanics with ratings, job count, ETA and fixed price the moment a postcode is entered. "Best match" highlighted.
- **Trust strip** — four badges: 4.9/5 rating, DBS-checked, same-day availability, 12-month guarantee.
- **"How it works" section** — four-step visual guide (Tell us your car → Pick what's wrong → See your fixed price → Pick a slot).
- **Customer reviews** — three featured 5-star testimonials with name, city, and review text.

#### 4.1.2 Booking Flow (Mobile-first — 4 steps)

Each step uses a **progress stepper** (step N of 4 with progress bar) and follows the principle of "one decision per screen."

**Step 1 — Vehicle (`BookingStep1`)**
- UK-style number plate input (yellow background, GB badge)
- DVLA auto-lookup: pulls make, model, engine, fuel type, year, MOT status, tax status, estimated mileage
- Detected vehicle displayed in a highlighted card with a green check
- "Edit manually" fallback link
- CTA: "Continue"

**Step 2 — Issue / Service (`BookingStep2`)**
- Search bar ("Search 'brakes', 'battery', 'service'…")
- 6-category grid with icons and starting prices:
  - Full service (from £119)
  - Diagnostic (from £45) — highlighted/featured
  - Brakes & tyres (from £75)
  - Battery (from £85)
  - Clutch / gears (from £180)
  - MOT pre-check (from £39)
- "Not sure what's wrong?" card — describes diagnostic-first option
- CTA: "See your price"

**Step 3 — Price & Mechanic Match (`BookingStep3`)**
- **Large price hero card** (gradient blue) showing fixed price (e.g. £139), service name, inclusions ("Parts + labour · No call-out fee · 12-month guarantee")
- Transparency note: "You won't be charged until your mechanic finishes the job and you confirm."
- **What's included** breakdown: parts, fitting, fluid top-up, guarantee — all marked "Included"
- **Matched mechanic card** with avatar, name, verified badge, star rating, job count, specialism, distance, and a "Change" link
- CTA: "Pick a time slot"

**Step 4 — Time Slot (`BookingStep4`)**
- **Date strip** — horizontal scroll of 5 days showing day name, date number, "Today/Tomorrow" label, available slot count
- **Time slot grid** — 3-column grid of available times (e.g. 08:00, 10:00, 12:00, 14:00, 16:00, 18:00) with "Popular" and "Last" badges
- **Address card** — pre-filled location with edit option, showing postcode, parking type ("Driveway"), special instructions ("Use the side gate")
- **Sticky CTA bar** — shows total to authorise (£139) and "Confirm booking" button
- Security note: "Pre-authorised. Charged only when complete."

#### 4.1.3 Post-Booking Screens

**Booking Confirmation (`BookingConfirmation`)**
- Success hero (gradient blue, checkmark, "You're all booked.")
- Booking ID displayed (e.g. BMT-94821)
- Mechanic contact card with Message and Call buttons
- Booking summary table (service, vehicle, date, address, total)
- Live tracking notice: "Live tracking starts at 11:00. You'll see James on the map."
- "Add to calendar" button

**Customer Dashboard (`CustomerDashboard`)**
- Greeting header ("Hi, Hannah.")
- **Live job card** — real-time tracking with animated map preview showing mechanic route, ETA countdown ("22 min"), mechanic avatar, job details, Message button
- **Upcoming section** — future bookings with confirmation status
- **Past jobs section** — completed jobs with ratings, prices, and "Book again" one-tap re-order

**Review Screen (`ReviewScreen`)**
- Job completion confirmation ("All sorted. £139 charged.")
- Star rating (1–5 interactive stars)
- Quick-tag feedback chips: Friendly, On time, Tidy work, Explained clearly, Great value, Quick
- Optional free-text review field (pre-populated with example)
- "Submit review" and "Skip for now" buttons

---

### 4.2 Mechanic Application

#### 4.2.1 Web Dashboard (Desktop)

**Sidebar navigation** with sections:
- Live jobs (with notification badge)
- My schedule
- Earnings
- Job history
- Reviews
- Availability
- Profile & docs

**Live Jobs Dashboard (`MechJobsDashboard`)**
- 4 KPI cards: Today's earnings, Jobs this week, Acceptance rate, Customer rating
- **New jobs feed** — live offers within radius with:
  - Service name, vehicle, area, distance, scheduled time, earnings amount
  - Expiry countdown for urgent jobs
  - Accept / Decline buttons per job
- **Today's schedule** — timeline view of confirmed jobs with status dots (done/next/future/buffer), locations, distances, and earnings per job. "Route view" button.
- **Service area map** — visual radius circle with customer dots, mechanic count
- **Weekly earnings chart** — bar chart by day with total and weekly comparison
- **Pro tier progress** — "You're 3 jobs from Pro tier" incentive card

**Job Detail View (`MechJobDetail`)**
- Job status pill (e.g. "Expires in 8 min") and category tag
- Service headline with vehicle details and mileage
- 4 info tiles: When, Distance, Estimated time, You earn
- Customer notes section (verbatim quote from customer)
- Photos uploaded by customer (thumbnail grid)
- Parts allocated section with supplier, quantity, cost
- Customer profile card with address, prior booking count, directions button
- Earnings breakdown: Customer pays → Parts cost → Platform fee → You receive
- "Why you're a great match" reasons card (specialism match, distance, past performance)

**Earnings & Payouts (`MechEarnings`)**
- 4 KPI cards: This month total, Jobs completed, Avg per job, Pending payout
- **30-day earnings chart** — area/line chart with period selectors (7d/30d/90d/Year)
- **Recent payouts table** — date, bank details (masked), amount, paid/pending status

**Availability & Service Area (`MechAvailability`)**
- **Working hours** — day-by-day toggle with customisable hours (e.g. Mon–Fri 08:00–18:00, Sat 09:00–14:00, Sun off)
- **Service radius** — slider from 2 to 20 miles with visual map preview, active customer count in radius, average weekly earning potential
- **Specialisms grid** — toggleable skill cards (Brakes, Suspension, Diagnostics, Battery, Service & MOT prep, Clutch, Cambelt, Air-con regas) with job counts

#### 4.2.2 Mobile App (Phone-optimised)

Bottom tab navigation: Jobs · Schedule · Earnings · Reviews · Me

**Day View (`MechMobileDay`)**
- Greeting and daily summary ("3 jobs lined up · £284 booked")
- **Earnings goal ring** — circular progress indicator showing daily target progress (e.g. £284 / £450 = 62%)
- **Up next** list — scheduled jobs with time, service, vehicle, location, distance, and earnings

**Job Offer (`MechMobileOffer`)**
- Urgent notification bar with expiry countdown
- Job summary: ID, category, service, vehicle
- **Earnings highlight card** (gradient blue) — large earnings amount, customer price, fee breakdown
- 4 info tiles: When, Duration, Distance, Customer rating
- Customer note (verbatim)
- Accept / Decline buttons

**Job In Progress (`MechMobileInProgress`)**
- Customer contact card with phone and message buttons
- **5-step progress checklist:**
  1. On the way (with arrival timestamp)
  2. Inspection (with confirmation note)
  3. Work in progress (with start time)
  4. Quality check & cleanup
  5. Complete & charge (customer signs off in app)
- "Mark step complete" progression button
- Earnings summary card with payout timing ("Paid 24h after sign-off")

---

### 4.3 Admin / Operations Console

Dark sidebar with three navigation sections:

**Operations:** Overview, All jobs, Live monitor, Disputes
**Network:** Mechanics, Approvals, Documents
**Commercial:** Pricing, Areas & demand, Analytics

Global search bar (⌘K) and notification bell with badge.

#### 4.3.1 Overview Dashboard (`AdminOverview`)
- 5 KPI cards: Live bookings, GMV today, Take-rate, Mechanics online, Avg time-to-accept
- **Live monitor** — real-time table of all active bookings showing ID, service, customer, mechanic, area, status (En route / In progress / Sourcing mechanic / Complete), and value
- **Needs your attention** — flagged items (low coverage areas, mechanic performance flags, disputes)
- **Demand by area** — horizontal bar chart showing job volume vs mechanic supply per area, with warnings for undersupplied zones

#### 4.3.2 Job Monitoring (`AdminJobs`)
- Full job table with filtering and tabs (All / Live / Pending / Complete / Disputed)
- Filter bar: Date range, Area, Service type, Mechanic, Status
- Table columns: Job ID, Service + area, Customer, Mechanic, Booked time, Status pill, Value
- Export and manual booking buttons

#### 4.3.3 Mechanic Approvals (`AdminApprovals`)
- Queue/detail split view
- **Approval queue** — sorted oldest-first, showing name, area, experience, application age, document completeness progress bar
- **Detail panel** for selected mechanic:
  - Profile header with name, area, experience, specialisms
  - **Verification checklist** (7 items):
    1. ID document (Driving licence) — verified
    2. Public liability insurance — valid until date
    3. DBS basic check — issued date
    4. Trade qualification (NVQ Level 3) — verified
    5. Bank account & VAT details — verified
    6. Reference 1 (previous workshop) — received
    7. Reference 2 (independent) — pending
  - Each item has a status indicator (green check / amber clock / red X), description, and "View" button
  - Auto-screen summary note
  - Approve / Reject buttons

#### 4.3.4 Pricing Controls (`AdminPricing`)
- **Base pricing rules** — editable list of services with base price and duration
- **Service detail editor** — for the selected service:
  - Base rate fields: Customer pays, Mechanic earns, Take-rate percentage
  - **Area multipliers table** — per-region multiplier (e.g. London Z1–Z2 = ×1.15, Rural = ×1.10) with calculated customer price
  - Visual progress bars for each multiplier
- **Surge pricing beta** — toggleable auto-raise (×1.15) when demand exceeds 3× supply

#### 4.3.5 Analytics (`AdminAnalytics`)
- Period selectors: 7d / 30d / 90d / Year
- 4 KPI cards: GMV, Net revenue, Bookings, Repeat rate
- **GMV trend chart** — line chart with current vs previous period comparison
- **Service mix breakdown** — horizontal bar chart showing % distribution of bookings by service type
- **Top performing areas** — ranked list with GMV and growth %
- **Top mechanics** — ranked list with job count, rating, and earnings
- **Conversion funnel** — 5-stage funnel (Reg lookup started → Service selected → Price seen → Slot picked → Booked) with counts and percentages

---

## 5. Business Model

| Revenue Lever | Detail |
|---|---|
| **Commission per job** | Default 15% take-rate. Lower for Pro-tier mechanics (loyalty incentive). |
| **Area-based pricing** | Multipliers by postcode: ×1.05–1.15 for premium areas, subsidised for growth areas. |
| **Surge pricing** | Auto-engages when demand outstrips supply (×1.15). |
| **Featured listings** | Paid placement for mechanics wanting priority in results. |
| **Future levers** | Parts margin, fleet contracts, insurance partnerships — all wired into the data model from day one. |

---

## 6. Design System Summary

| Element | Specification |
|---|---|
| **Brand** | Book My Tech |
| **Tone** | Professional, modern, frictionless, trustworthy |
| **Primary colour** | `#2563EB` (blue) |
| **Dark variant** | `#1E3A8A` |
| **Accent** | `#3B82F6` |
| **Font** | Inter (web) / SF Pro (iOS) |
| **Border radius** | 10px (buttons), 16px (cards), 8px (inputs), 999px (pills) |
| **Card shadow** | `0 4px 20px rgba(0,0,0,0.05)` |
| **Spacing scale** | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 px |
| **Grid** | 12-column, max-width 1200px |
| **Approach** | Mobile-first (375px), scale up |

---

## 7. Tech Stack (Recommended)

| Layer | Technology |
|---|---|
| **Frontend (Customer)** | Next.js (React) / Responsive web app |
| **Frontend (Mechanic Mobile)** | React Native or PWA |
| **Frontend (Admin)** | Same Next.js app, role-gated routes |
| **Backend** | Supabase (Postgres + Auth + Edge Functions + Realtime) |
| **Payments** | Stripe Connect (marketplace model with pre-auth and capture) |
| **Vehicle Lookup** | DVLA Vehicle Enquiry API |
| **Maps & Routing** | Google Maps Platform (geocoding, directions, ETA) |
| **Push Notifications** | Firebase Cloud Messaging / Expo Notifications |
| **Hosting** | Vercel (web) + Supabase (backend) |
| **Storage** | Supabase Storage (mechanic documents, customer photos) |
| **Email / SMS** | Resend (transactional email) + Twilio (SMS notifications) |

---

## 8. Database Schema (Core Tables)

| Table | Purpose |
|---|---|
| `users` | Auth accounts for customers, mechanics, admins |
| `profiles` | Extended profile data, role, avatar, contact info |
| `vehicles` | Customer vehicles (reg, make, model, year, fuel, MOT, mileage) |
| `services` | Service catalogue (name, description, base price, duration, category) |
| `mechanics` | Mechanic profiles (bio, experience, specialisms, DBS status, insurance, radius, base location) |
| `mechanic_availability` | Weekly working hours per mechanic |
| `mechanic_documents` | Uploaded verification documents with review status |
| `bookings` | Core booking record (customer, mechanic, vehicle, service, status, price, scheduled datetime, address, notes) |
| `booking_steps` | Job progress steps (on the way → inspection → in progress → quality check → complete) |
| `payments` | Stripe payment intents, pre-auth amounts, capture records, mechanic payouts |
| `reviews` | Star rating, tags, free-text review, customer → mechanic link |
| `pricing_rules` | Base prices per service, area multipliers, surge toggles |
| `areas` | Geographic zones with multiplier configs |
| `notifications` | Push notification queue (job offers, booking updates, review requests) |
| `disputes` | Dispute records linked to bookings with resolution status |

---

## 9. Phased Build Plan

### Phase 1 — MVP Launch (Weeks 1–6)
**Goal:** Get the core booking loop live in London. Customer can book → mechanic can accept → admin can monitor.

| Week | Deliverable |
|---|---|
| 1–2 | Project scaffold, Supabase schema, auth (customer + mechanic + admin roles), DVLA API integration, service catalogue seed data |
| 3 | Customer booking flow (4-step), vehicle lookup, service selection, pricing display, time slot picker |
| 4 | Mechanic web dashboard — live jobs feed, accept/decline, daily schedule, earnings view |
| 5 | Admin console — overview dashboard, job monitoring table, mechanic approval queue with document review |
| 6 | Stripe Connect integration (customer pre-auth, mechanic payouts), booking confirmation, email notifications, QA + staging deploy |

**Launch criteria:** 3 London boroughs, 10–20 mechanics, manual onboarding.

---

### Phase 2 — Mechanic Mobile App + Automation (Weeks 7–10)
**Goal:** Give mechanics a field-ready mobile experience and automate the dispatch pipeline.

| Week | Deliverable |
|---|---|
| 7 | Mechanic mobile app — day view, incoming job offer screen, push notifications for new jobs |
| 8 | Job-in-progress workflow (5-step checklist), customer sign-off, auto-charge on completion |
| 9 | Smart dispatch — auto-match mechanic by proximity, specialism, availability, rating. Fallback queue if declined. |
| 10 | Customer dashboard with live tracking (mechanic location on map), in-app messaging (customer ↔ mechanic), review prompts post-job |

---

### Phase 3 — Commercial & Growth (Weeks 11–14)
**Goal:** Turn on the revenue levers and expand geographic coverage.

| Week | Deliverable |
|---|---|
| 11 | Pricing engine — area-based multipliers, admin pricing controls, base rate editor |
| 12 | Surge pricing logic (auto-engage when demand > 3× supply), featured mechanic listings |
| 13 | Analytics dashboard — GMV trends, service mix, conversion funnel, top areas, top mechanics, repeat rate tracking |
| 14 | Multi-city expansion tooling — area setup wizard, mechanic recruitment flow, demand heatmaps |

---

### Phase 4 — Retention & Optimisation (Weeks 15–18)
**Goal:** Drive repeat bookings and operational excellence.

| Week | Deliverable |
|---|---|
| 15 | Customer re-booking flow (one-tap repeat from past jobs), service reminders (MOT due, service interval) |
| 16 | Mechanic Pro tier — loyalty programme, lower commission rate, priority job access, Pro badge |
| 17 | Dispute resolution system — customer refund requests, admin arbitration workflow, mechanic performance flags |
| 18 | Parts margin layer — BMT-sourced parts catalogue, margin tracking, supplier integration |

---

### Phase 5 — Scale & Future (Weeks 19+)
**Goal:** National expansion and new revenue streams.

- Fleet contracts (B2B pricing for businesses with vehicle fleets)
- Insurance partnerships (warranty and breakdown cover add-ons)
- Calendar sync for mechanics (Google Calendar / Outlook integration)
- Advanced reporting and financial exports
- Native iOS/Android apps for customers (if PWA isn't sufficient)
- API for partner integrations (car dealerships, insurance companies)

---

## 10. Screen Inventory Summary

| Portal | Screen | Type |
|---|---|---|
| Customer | Homepage | Desktop web |
| Customer | Booking Step 1 — Vehicle | Mobile web |
| Customer | Booking Step 2 — Issue/Service | Mobile web |
| Customer | Booking Step 3 — Price & Mechanic | Mobile web |
| Customer | Booking Step 4 — Time Slot | Mobile web |
| Customer | Booking Confirmation | Mobile web |
| Customer | Dashboard (My Bookings) | Mobile web |
| Customer | Review Screen | Mobile web |
| Mechanic | Live Jobs Dashboard | Desktop web |
| Mechanic | Job Detail View | Desktop web |
| Mechanic | Earnings & Payouts | Desktop web |
| Mechanic | Availability & Service Area | Desktop web |
| Mechanic | Mobile — Day View | Mobile web/app |
| Mechanic | Mobile — Job Offer | Mobile web/app |
| Mechanic | Mobile — Job In Progress | Mobile web/app |
| Admin | Overview Dashboard | Desktop web |
| Admin | Job Monitoring Table | Desktop web |
| Admin | Mechanic Approvals | Desktop web |
| Admin | Pricing Controls | Desktop web |
| Admin | Analytics | Desktop web |

**Total: 7 customer screens · 7 mechanic screens · 5 admin screens · 1 unified platform.**

---

## 11. Key Integrations

| Integration | Purpose | API/Service |
|---|---|---|
| DVLA Vehicle Enquiry | Auto-populate vehicle data from reg plate | GOV.UK VES API |
| Stripe Connect | Marketplace payments, pre-auth, mechanic payouts | Stripe |
| Google Maps Platform | Geocoding, distance matrix, live tracking | Google |
| Firebase / Expo | Push notifications for job offers and updates | Firebase Cloud Messaging |
| Supabase Realtime | Live dashboard updates, job status changes | Supabase |
| Resend | Transactional emails (confirmations, reminders) | Resend |
| Twilio | SMS notifications (booking updates, OTP) | Twilio |

---

## 12. Success Criteria

1. **Customer can complete a booking in under 60 seconds** from entering their reg plate.
2. **Mechanic receives and can accept a job offer within 5 seconds** of it being dispatched.
3. **Admin can see all live jobs, mechanic supply, and demand hotspots** in a single view.
4. **Platform achieves ≥ 42% repeat booking rate** within 90 days of launch.
5. **Take-rate holds at 15%** with area multipliers protecting margin in premium postcodes.
6. **Mechanic onboarding (application to approved) takes < 48 hours** with automated document verification.

---

*This document fully describes the Book My Tech platform as proposed. Use it to generate a PDF walkthrough, a development roadmap, or to brief any development team on the scope and vision of the project.*
