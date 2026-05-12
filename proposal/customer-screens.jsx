// Customer-facing screens — desktop homepage + mobile-first booking flow.
// Designed at 1280×800 desktop / 375×760 mobile to fit the standard mock frames.

// ----------------------------------------------------------------------------
// Shared customer chrome
// ----------------------------------------------------------------------------

const CustomerNav = ({ active = "Book", dark = false }) => (
  <header style={{
    height: 96, padding: "0 32px",
    display: "flex", alignItems: "center", gap: 32,
    background: dark ? "transparent" : "#fff",
    borderBottom: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #E2E8F0",
    color: dark ? "#fff" : "#0F172A",
  }}>
    <div style={{ display: "flex", alignItems: "center" }}>
      <img src="assets/logo-no-bg.png" alt="Book My Tech" style={{ height: 76, display: "block", filter: dark ? "brightness(0) invert(1)" : "none" }} />
    </div>
    <nav style={{ display: "flex", gap: 4, marginLeft: 24 }}>
      {["Book", "How it works", "Services", "For mechanics", "Help"].map(l => (
        <span key={l} style={{
          padding: "8px 14px", fontSize: 14, fontWeight: l === active ? 600 : 500,
          color: l === active ? (dark ? "#fff" : "#2563EB") : (dark ? "rgba(255,255,255,0.7)" : "#334155"),
          background: l === active ? (dark ? "rgba(255,255,255,0.1)" : "#EFF6FF") : "transparent",
          borderRadius: 8, cursor: "pointer",
        }}>{l}</span>
      ))}
    </nav>
    <div style={{ flex: 1 }} />
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: dark ? "rgba(255,255,255,0.7)" : "#334155" }}>Sign in</span>
      <Button variant={dark ? "secondary" : "primary"} size="sm" style={dark ? { background: "#fff", color: "#2563EB", border: 0 } : {}}>Book a mechanic</Button>
    </div>
  </header>
);

// ----------------------------------------------------------------------------
// 1. HOMEPAGE — desktop, dark hero
// ----------------------------------------------------------------------------

const CustomerHomepage = () => (
  <div style={{ width: "100%", height: "100%", overflow: "auto", background: "#F8FAFC", fontFamily: "Inter, system-ui, sans-serif", color: "#0F172A" }}>
    {/* Hero */}
    <div style={{ background: "linear-gradient(135deg, #1E3A8A 0%, #2563EB 60%, #3B82F6 100%)", color: "#fff", paddingBottom: 56 }}>
      <CustomerNav active="Book" dark />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 32px 0", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 56, alignItems: "center" }}>
        <div>
          <Pill tone="dark" style={{ background: "rgba(255,255,255,0.14)", color: "#fff", padding: "6px 12px", marginBottom: 18 }} dot>
            <span style={{ background: "#22C55E", width: 6, height: 6, borderRadius: "50%" }} /> 1,200+ mechanics live across the UK
          </Pill>
          <h1 style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.05, marginBottom: 18, color: "#fff" }}>
            Your car, fixed at your door — booked in 60 seconds.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: "rgba(255,255,255,0.85)", maxWidth: 540, marginBottom: 28 }}>
            Vetted mobile mechanics. Transparent pricing. Pay only when the job is done.
            No more garages. No more hidden fees. Just one tap, and we'll come to you.
          </p>

          {/* Inline registration finder */}
          <Card style={{ padding: 14, display: "flex", alignItems: "center", gap: 10, maxWidth: 540 }}>
            <div style={{ background: "#FEF3C7", color: "#0F172A", fontWeight: 800, fontSize: 14, letterSpacing: "0.05em", height: 40, padding: "0 12px", borderRadius: 6, display: "flex", alignItems: "center", gap: 6, border: "1.5px solid #0F172A" }}>
              <span style={{ background: "#2563EB", color: "#fff", padding: "2px 6px", fontSize: 9, borderRadius: 2, fontWeight: 700, letterSpacing: "0.06em" }}>GB</span>
              LB21 XYZ
            </div>
            <input placeholder="Your postcode" defaultValue="SE15 4QF" style={{ flex: 1, height: 40, border: 0, fontSize: 14, fontFamily: "inherit", outline: "none", color: "#0F172A" }} />
            <Button variant="primary" iconRight="arrow">Get a price</Button>
          </Card>
          <div style={{ display: "flex", gap: 18, marginTop: 22, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="check" size={13} color="#22C55E" /> No upfront payment</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="check" size={13} color="#22C55E" /> Vetted mechanics only</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="check" size={13} color="#22C55E" /> 12-month workmanship guarantee</span>
          </div>
        </div>

        {/* Right floating card */}
        <div style={{ position: "relative" }}>
          <Card style={{ padding: 0, overflow: "hidden", maxWidth: 420, marginLeft: "auto", border: 0, boxShadow: "0 20px 60px rgba(15,23,42,0.25)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="zap" size={16} color="#2563EB" />
              <div style={{ fontWeight: 700, fontSize: 14 }}>Live: getting prices for your area</div>
            </div>
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { name: "James M.", rating: 4.9, jobs: 312, eta: "Today, 14:00", price: "£89", featured: true },
                { name: "Priya S.", rating: 4.8, jobs: 198, eta: "Today, 16:30", price: "£94" },
                { name: "Tom W.", rating: 4.9, jobs: 421, eta: "Tomorrow, 09:00", price: "£87" },
              ].map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, border: m.featured ? "1.5px solid #2563EB" : "1px solid #E2E8F0", borderRadius: 12, background: m.featured ? "#EFF6FF" : "#fff", position: "relative" }}>
                  {m.featured && <span style={{ position: "absolute", top: -8, left: 14, background: "#2563EB", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 999, letterSpacing: "0.06em" }}>BEST MATCH</span>}
                  <Avatar name={m.name} tint={i} size={42} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{m.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748B" }}>
                      <Stars value={Math.round(m.rating)} size={10} /> {m.rating} · {m.jobs} jobs · ETA {m.eta}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em" }}>{m.price}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 20px", background: "#F8FAFC", borderTop: "1px solid #E2E8F0", fontSize: 11, color: "#64748B", display: "flex", justifyContent: "space-between" }}>
              <span>Updated just now</span>
              <span style={{ color: "#2563EB", fontWeight: 600 }}>See 8 more →</span>
            </div>
          </Card>
        </div>
      </div>
    </div>

    {/* Trust strip */}
    <div style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", padding: "20px 32px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <TrustBadge icon="star" value="4.9 / 5" label="Across 8,400+ reviews" />
        <TrustBadge icon="shield" value="DBS-checked" label="Every mechanic vetted" />
        <TrustBadge icon="zap" value="Same-day" label="Most jobs booked within 4 hrs" />
        <TrustBadge icon="badge" value="12-month" label="Parts & labour guarantee" />
      </div>
    </div>

    {/* How it works */}
    <div style={{ padding: "56px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <Overline style={{ color: "#2563EB", marginBottom: 8 }}>How it works</Overline>
        <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.025em", color: "#0F172A", marginBottom: 8 }}>From breakdown to fixed in four taps.</h2>
        <p style={{ fontSize: 16, color: "#475569", maxWidth: 600, margin: "0 auto" }}>
          No phone calls. No quotes. No waiting around for the AA. Just a fast, transparent booking.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {[
          { n: "01", icon: "car", t: "Tell us your car", d: "Drop in your reg — we'll pull the make, model and engine straight from the DVLA." },
          { n: "02", icon: "wrench", t: "Pick what's wrong", d: "Choose from a service or describe a fault. We'll match the right specialist for the job." },
          { n: "03", icon: "pound", t: "See your fixed price", d: "Transparent pricing for your area. No hidden fees. Pay only when the job is done." },
          { n: "04", icon: "calendar", t: "Pick a slot, we come to you", d: "Same-day or scheduled. We'll send a vetted mechanic to your home, work, or roadside." },
        ].map(s => (
          <Card key={s.n} style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={s.icon} size={20} color="#2563EB" />
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#CBD5E1", letterSpacing: "0.1em" }}>{s.n}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 6, letterSpacing: "-0.01em" }}>{s.t}</div>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>{s.d}</div>
          </Card>
        ))}
      </div>
    </div>

    {/* Reviews */}
    <div style={{ padding: "0 32px 56px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { n: "Hannah R.", c: "Crystal Palace", t: "Booked at 9am, fixed by lunch.", d: "Battery died on the school run. Booked on the train, James came to my drive at 11. Properly impressed.", r: 5 },
          { n: "Marcus K.", c: "Manchester", t: "No more garage waiting rooms.", d: "Brake pads done while I was on a Zoom call. £40 cheaper than Kwik Fit and zero faff.", r: 5 },
          { n: "Sasha T.", c: "Bristol", t: "Trustworthy and transparent.", d: "Loved seeing the mechanic's reviews and exact price up front. No nasty surprises at the end.", r: 5 },
        ].map((r, i) => (
          <Card key={i}>
            <Stars value={r.r} size={14} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", marginTop: 10, marginBottom: 8, letterSpacing: "-0.01em" }}>"{r.t}"</div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, marginBottom: 14 }}>{r.d}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 10, borderTop: "1px solid #F1F5F9" }}>
              <Avatar name={r.n} tint={i + 1} size={32} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{r.n}</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>{r.c}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  </div>
);

// ----------------------------------------------------------------------------
// MOBILE BOOKING FLOW — designed for 375px width
// ----------------------------------------------------------------------------

const MobileShell = ({ children, title, back = true, action }) => (
  <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#F8FAFC", fontFamily: "Inter, system-ui, sans-serif", color: "#0F172A" }}>
    <div style={{ padding: "14px 18px", background: "#fff", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
      {back && <button style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="chevLeft" size={16} color="#0F172A" /></button>}
      <div style={{ flex: 1, fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div>
      {action}
    </div>
    <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
  </div>
);

const MobileStepper = ({ step, total = 4, label }) => (
  <div style={{ padding: "16px 18px 12px", background: "#fff", borderBottom: "1px solid #F1F5F9" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#2563EB", letterSpacing: "0.08em", textTransform: "uppercase" }}>Step {step} of {total}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>{label}</div>
    </div>
    <div style={{ height: 6, background: "#E2E8F0", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${(step / total) * 100}%`, height: "100%", background: "#2563EB", transition: "width 200ms ease" }} />
    </div>
  </div>
);

// --- Booking Step 1: Vehicle ---
const BookingStep1 = () => (
  <MobileShell title="Book a mechanic">
    <MobileStepper step={1} total={4} label="Your vehicle" />
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>What are you driving?</h2>
        <p style={{ fontSize: 13, color: "#64748B" }}>Drop in your reg and we'll pull everything we need.</p>
      </div>

      {/* Reg plate input */}
      <div style={{ background: "#FEF3C7", border: "2px solid #0F172A", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ background: "#2563EB", color: "#fff", padding: "6px 8px", fontSize: 11, fontWeight: 800, borderRadius: 4, letterSpacing: "0.05em", textAlign: "center" }}>GB<br /><span style={{ fontSize: 8, opacity: 0.85 }}>★</span></div>
        <input defaultValue="LB21 XYZ" style={{ flex: 1, fontSize: 24, fontWeight: 800, letterSpacing: "0.06em", color: "#0F172A", background: "transparent", border: 0, outline: "none", fontFamily: "inherit", textAlign: "center" }} />
      </div>

      {/* Detected vehicle */}
      <Card style={{ padding: 14, borderColor: "#2563EB", background: "#EFF6FF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="car" size={24} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Volkswagen Golf · 1.5 TSI</div>
            <div style={{ fontSize: 12, color: "#475569" }}>2021 · Petrol · DSG · 5-door</div>
          </div>
          <Icon name="check" size={18} color="#22C55E" />
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #DBEAFE", fontSize: 11, color: "#475569", display: "flex", gap: 12 }}>
          <span>MOT: <strong style={{ color: "#0F172A" }}>Aug 2026</strong></span>
          <span>Tax: <strong style={{ color: "#0F172A" }}>Valid</strong></span>
          <span>Mileage: <strong style={{ color: "#0F172A" }}>42,310</strong></span>
        </div>
      </Card>

      <div style={{ fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="info" size={14} color="#64748B" />
        Pulled from DVLA. Wrong car? <span style={{ color: "#2563EB", fontWeight: 600, marginLeft: 4 }}>Edit manually</span>
      </div>

      <Button variant="primary" fullWidth size="lg" iconRight="arrow">Continue</Button>
      <div style={{ textAlign: "center", fontSize: 11, color: "#94A3B8" }}>No account needed yet — we'll save your booking automatically.</div>
    </div>
  </MobileShell>
);

// --- Booking Step 2: Service / issue ---
const BookingStep2 = () => (
  <MobileShell title="Book a mechanic">
    <MobileStepper step={2} total={4} label="What needs fixing" />
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>What's the issue?</h2>
        <p style={{ fontSize: 13, color: "#64748B" }}>Pick the closest match — we'll quote it instantly.</p>
      </div>

      {/* Search */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 14, top: 16 }}><Icon name="search" size={16} color="#94A3B8" /></div>
        <input placeholder="Search 'brakes', 'battery', 'service'…" style={{ width: "100%", height: 48, padding: "0 14px 0 40px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" }} />
      </div>

      {/* Categories */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { i: "wrench", t: "Full service", d: "From £119" },
          { i: "alert", t: "Diagnostic", d: "From £45", featured: true },
          { i: "car", t: "Brakes & tyres", d: "From £75" },
          { i: "bolt", t: "Battery", d: "From £85" },
          { i: "settings", t: "Clutch / gears", d: "From £180" },
          { i: "shield", t: "MOT pre-check", d: "From £39" },
        ].map((c, i) => (
          <div key={i} style={{ padding: 14, background: c.featured ? "#EFF6FF" : "#fff", border: c.featured ? "1.5px solid #2563EB" : "1px solid #E2E8F0", borderRadius: 12, cursor: "pointer" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: c.featured ? "#2563EB" : "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <Icon name={c.i} size={16} color={c.featured ? "#fff" : "#2563EB"} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{c.t}</div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{c.d}</div>
          </div>
        ))}
      </div>

      <Card style={{ padding: 14, background: "#F8FAFC", border: "1px dashed #94A3B8" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>Not sure what's wrong?</div>
        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>Describe the symptoms and we'll send a diagnostic specialist. Just £45 — refunded against the repair.</div>
      </Card>

      <Button variant="primary" fullWidth size="lg" iconRight="arrow">See your price</Button>
    </div>
  </MobileShell>
);

// --- Booking Step 3: Pricing & mechanic match ---
const BookingStep3 = () => (
  <MobileShell title="Your price">
    <MobileStepper step={3} total={4} label="Price & mechanic" />
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Big price card */}
      <Card style={{ background: "linear-gradient(135deg, #1E3A8A, #2563EB)", color: "#fff", border: 0, padding: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Fixed price · Brake pads (front)</div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", marginTop: 4 }}>£139</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>Parts + labour · No call-out fee · 12-month guarantee</div>
        <div style={{ marginTop: 14, padding: 12, background: "rgba(255,255,255,0.12)", borderRadius: 10, fontSize: 11, color: "rgba(255,255,255,0.85)", display: "flex", gap: 10 }}>
          <Icon name="info" size={14} color="rgba(255,255,255,0.8)" />
          <div>You won't be charged until your mechanic finishes the job and you confirm.</div>
        </div>
      </Card>

      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginTop: 4 }}>What's included</div>
      <Card style={{ padding: 0 }}>
        {[
          ["Genuine brake pads (Brembo or equivalent)", "Included"],
          ["Removal & fitting (60–90 min)", "Included"],
          ["Brake fluid top-up", "Included"],
          ["12-month parts & labour guarantee", "Included"],
        ].map(([l, v], i, arr) => (
          <div key={i} style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : 0, fontSize: 13 }}>
            <Icon name="check" size={14} color="#22C55E" />
            <div style={{ flex: 1 }}>{l}</div>
            <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </Card>

      {/* Matched mechanic */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        Your matched mechanic <span style={{ fontSize: 11, color: "#2563EB", fontWeight: 600 }}>Change</span>
      </div>
      <Card style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Avatar name="James Marsden" tint={0} size={52} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>James M.</div>
              <Pill tone="success" dot>Verified</Pill>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569", marginBottom: 4 }}>
              <Stars value={5} size={12} /> 4.9 · 312 jobs
            </div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Brake & suspension specialist · 7 yrs · 2.4 mi away</div>
          </div>
        </div>
      </Card>

      <Button variant="primary" fullWidth size="lg" iconRight="arrow">Pick a time slot</Button>
    </div>
  </MobileShell>
);

// --- Booking Step 4: Time slot ---
const BookingStep4 = () => (
  <MobileShell title="Pick a time">
    <MobileStepper step={4} total={4} label="When works for you?" />
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>When suits you?</h2>
        <p style={{ fontSize: 13, color: "#64748B" }}>James is free as soon as today.</p>
      </div>

      {/* Date strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {[
          { d: "Wed", n: "27", l: "Today", on: false, free: 4 },
          { d: "Thu", n: "28", l: "Tomorrow", on: true, free: 6 },
          { d: "Fri", n: "29", l: "", on: false, free: 8 },
          { d: "Sat", n: "30", l: "", on: false, free: 3 },
          { d: "Mon", n: "02", l: "", on: false, free: 5 },
        ].map((d, i) => (
          <div key={i} style={{ padding: "10px 6px", textAlign: "center", border: d.on ? "1.5px solid #2563EB" : "1px solid #E2E8F0", background: d.on ? "#2563EB" : "#fff", color: d.on ? "#fff" : "#0F172A", borderRadius: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: d.on ? "rgba(255,255,255,0.8)" : "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>{d.d}</div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", margin: "2px 0" }}>{d.n}</div>
            <div style={{ fontSize: 9, color: d.on ? "rgba(255,255,255,0.8)" : "#94A3B8" }}>{d.free} slots</div>
          </div>
        ))}
      </div>

      {/* Time slots */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginTop: 4 }}>Thursday 28 April</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { t: "08:00", on: false }, { t: "10:00", on: false, popular: true }, { t: "12:00", on: true },
          { t: "14:00", on: false }, { t: "16:00", on: false }, { t: "18:00", on: false, last: true },
        ].map((s, i) => (
          <div key={i} style={{ position: "relative", padding: "14px 8px", textAlign: "center", border: s.on ? "1.5px solid #2563EB" : "1px solid #E2E8F0", background: s.on ? "#EFF6FF" : "#fff", color: s.on ? "#1E3A8A" : "#0F172A", borderRadius: 10, fontWeight: 700, fontSize: 14 }}>
            {s.t}
            {s.popular && <div style={{ position: "absolute", top: -7, right: -2, background: "#FEF3C7", color: "#B45309", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999 }}>Popular</div>}
            {s.last && <div style={{ position: "absolute", top: -7, right: -2, background: "#FEE2E2", color: "#B91C1C", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999 }}>Last</div>}
          </div>
        ))}
      </div>

      {/* Address */}
      <Card style={{ padding: 14, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Icon name="pin" size={16} color="#2563EB" />
          <div style={{ fontSize: 13, fontWeight: 700 }}>Where's the car?</div>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#2563EB", fontWeight: 600 }}>Edit</span>
        </div>
        <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 500 }}>34 Rye Lane, Peckham</div>
        <div style={{ fontSize: 12, color: "#64748B" }}>SE15 4QF · Driveway · "Use the side gate"</div>
      </Card>

      {/* Sticky CTA */}
      <div style={{ marginTop: 6, padding: 14, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, display: "flex", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>Total to authorise</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>£139</div>
        </div>
        <Button variant="primary" iconRight="arrow" style={{ marginLeft: "auto", flex: 1, height: 48, fontSize: 15 }}>Confirm booking</Button>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: "#64748B" }}>
        <Icon name="lock" size={12} color="#64748B" /> Pre-authorised. Charged only when complete.
      </div>
    </div>
  </MobileShell>
);

// --- Booking Confirmation ---
const BookingConfirmation = () => (
  <MobileShell title="You're booked" back={false}>
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Hero confirmation */}
      <div style={{ background: "linear-gradient(135deg, #1E3A8A, #2563EB)", color: "#fff", borderRadius: 16, padding: 22, position: "relative", overflow: "hidden" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <Icon name="check" size={28} color="#fff" stroke={2.5} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>You're all booked.</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>James is on the way to you on Thursday at 12:00.</div>
        <div style={{ marginTop: 16, padding: 12, background: "rgba(255,255,255,0.14)", borderRadius: 10, fontSize: 11, color: "rgba(255,255,255,0.9)" }}>
          Booking ID · <strong style={{ color: "#fff" }}>BMT-94821</strong>
        </div>
      </div>

      {/* Mechanic card */}
      <Card>
        <div style={{ display: "flex", gap: 12 }}>
          <Avatar name="James Marsden" tint={0} size={56} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>James Marsden</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}><Stars value={5} size={12} /> 4.9 · 312 jobs</div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <Button variant="primary" size="sm" icon="message">Message</Button>
              <Button variant="ghost" size="sm" icon="phone">Call</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <Overline>Booking summary</Overline>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
          {[
            ["Service", "Brake pads (front)"],
            ["Vehicle", "VW Golf · LB21 XYZ"],
            ["Date", "Thursday 28 April · 12:00"],
            ["Address", "34 Rye Lane, Peckham"],
            ["Total", "£139"],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: i < 4 ? "1px solid #F1F5F9" : 0 }}>
              <span style={{ color: "#64748B" }}>{k}</span>
              <span style={{ fontWeight: 600, color: "#0F172A" }}>{v}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ background: "#EFF6FF", border: "1px solid #DBEAFE" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="zap" size={16} color="#fff" />
          </div>
          <div style={{ fontSize: 12, color: "#1E3A8A", lineHeight: 1.5 }}>
            <strong>Live tracking starts at 11:00.</strong> You'll see James on the map and get a 30-minute heads up before he arrives.
          </div>
        </div>
      </Card>

      <Button variant="ghost" fullWidth icon="calendar">Add to calendar</Button>
    </div>
  </MobileShell>
);

// --- Customer Dashboard (mobile) ---
const CustomerDashboard = () => (
  <MobileShell title="My bookings" back={false} action={<Avatar name="HR" tint={3} size={32} />}>
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 12, color: "#64748B" }}>Wed 27 Apr</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 2 }}>Hi, Hannah.</h1>
      </div>

      {/* Live job card */}
      <Card style={{ padding: 0, overflow: "hidden", border: "1.5px solid #2563EB" }}>
        <div style={{ background: "#0F172A", color: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 0 4px rgba(34,197,94,0.25)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Mechanic on the way · ETA 22 min</span>
        </div>
        {/* Map preview */}
        <div style={{ height: 120, background: "linear-gradient(135deg, #DBEAFE, #EFF6FF)", position: "relative", borderBottom: "1px solid #E2E8F0" }}>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 320 120">
            <path d="M20,90 Q80,80 130,70 T240,40 L300,30" stroke="#2563EB" strokeWidth="3" fill="none" strokeDasharray="6 4" />
            <circle cx="20" cy="90" r="6" fill="#22C55E" />
            <circle cx="300" cy="30" r="6" fill="#2563EB" />
          </svg>
          <div style={{ position: "absolute", left: 12, bottom: 10, fontSize: 10, fontWeight: 600, color: "#1E3A8A", background: "rgba(255,255,255,0.85)", padding: "3px 6px", borderRadius: 6 }}>James · 22 min away</div>
        </div>
        <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name="James M" tint={0} size={42} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Brake pads · VW Golf</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Today 12:00 · £139</div>
          </div>
          <Button variant="primary" size="sm" icon="message">Message</Button>
        </div>
      </Card>

      <Overline>Upcoming</Overline>
      <Card style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="calendar" size={18} color="#2563EB" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Annual service</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Sat 14 May · 10:00 · £179</div>
          </div>
          <Pill tone="active">Confirmed</Pill>
        </div>
      </Card>

      <Overline>Past jobs</Overline>
      {[
        { t: "MOT pre-check", d: "12 Mar 2026 · Tom W.", p: "£39", r: 5 },
        { t: "Battery replacement", d: "08 Jan 2026 · Priya S.", p: "£124", r: 5 },
      ].map((j, i) => (
        <Card key={i} style={{ padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{j.t}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>{j.d}</div>
              <div style={{ marginTop: 6 }}><Stars value={j.r} size={11} /></div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{j.p}</div>
              <div style={{ fontSize: 11, color: "#2563EB", fontWeight: 600, marginTop: 4 }}>Book again</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </MobileShell>
);

// --- Review screen ---
const ReviewScreen = () => (
  <MobileShell title="Job complete" back={false}>
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ textAlign: "center", padding: "20px 0 4px" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#DCFCE7", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <Icon name="check" size={32} color="#15803D" stroke={2.5} />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>All sorted.</h1>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>£139 charged. Your mechanic is signed off.</p>
      </div>

      <Card style={{ textAlign: "center", padding: 22 }}>
        <Avatar name="James M" tint={0} size={56} />
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>How was James?</div>
        <div style={{ fontSize: 12, color: "#64748B" }}>Your rating helps other drivers.</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <Icon key={i} name="star" size={36} color={i <= 5 ? "#F59E0B" : "#E2E8F0"} stroke={1.5} />
          ))}
        </div>
      </Card>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>What went well?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[
            { l: "Friendly", on: true },
            { l: "On time", on: true },
            { l: "Tidy work", on: true },
            { l: "Explained clearly", on: false },
            { l: "Great value", on: false },
            { l: "Quick", on: false },
          ].map((t, i) => (
            <span key={i} style={{ padding: "8px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: t.on ? "1.5px solid #2563EB" : "1px solid #E2E8F0", background: t.on ? "#EFF6FF" : "#fff", color: t.on ? "#1E3A8A" : "#475569" }}>{t.l}</span>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Add a public review (optional)</div>
        <textarea defaultValue="James was brilliant — turned up early, talked me through the work, and left the drive spotless. Will definitely book again." style={{ width: "100%", minHeight: 96, padding: 14, border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 13, fontFamily: "inherit", color: "#0F172A", boxSizing: "border-box", resize: "none" }} />
      </div>

      <Button variant="primary" fullWidth size="lg">Submit review</Button>
      <Button variant="ghost" fullWidth>Skip for now</Button>
    </div>
  </MobileShell>
);

Object.assign(window, {
  CustomerHomepage,
  BookingStep1, BookingStep2, BookingStep3, BookingStep4,
  BookingConfirmation, CustomerDashboard, ReviewScreen,
  CustomerNav, MobileShell,
});
