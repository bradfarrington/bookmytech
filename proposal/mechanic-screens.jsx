// Mechanic screens — web dashboard (desktop 1280×800) and mobile app (375 wide).
// Mechanics can use either; mobile is the field tool, web is for earnings & settings.

// ----------------------------------------------------------------------------
// Mechanic web shell
// ----------------------------------------------------------------------------

const MechSidebar = ({ active = "jobs" }) => {
  const items = [
    { id: "jobs", label: "Live jobs", icon: "inbox", badge: 4 },
    { id: "schedule", label: "My schedule", icon: "calendar" },
    { id: "earnings", label: "Earnings", icon: "pound" },
    { id: "history", label: "Job history", icon: "folder" },
    { id: "reviews", label: "Reviews", icon: "star" },
    { id: "settings", label: "Availability", icon: "sliders" },
    { id: "profile", label: "Profile & docs", icon: "user" },
  ];
  return (
    <aside style={{ width: 240, background: "#fff", display: "flex", flexDirection: "column", flexShrink: 0, borderRight: "1px solid #E2E8F0" }}>
      <div style={{ padding: "20px 18px", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #E2E8F0", height: 104, boxSizing: "border-box" }}>
        <img src="assets/logo-no-bg.png" alt="Book My Tech" style={{ height: 72, maxWidth: "100%", display: "block" }} />
      </div>
      <nav style={{ padding: 10, display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {items.map(it => {
          const on = it.id === active;
          return (
            <div key={it.id} style={{
              padding: "10px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 12,
              background: on ? "#2563EB" : "transparent",
              color: on ? "#fff" : "#334155",
              fontSize: 13, fontWeight: on ? 600 : 500, cursor: "pointer",
            }}>
              <Icon name={it.icon} size={16} color={on ? "#fff" : "#64748B"} />
              <span style={{ flex: 1 }}>{it.label}</span>
              {it.badge && <span style={{ background: on ? "rgba(255,255,255,0.2)" : "#FEE2E2", color: on ? "#fff" : "#B91C1C", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999 }}>{it.badge}</span>}
            </div>
          );
        })}
      </nav>
      <div style={{ padding: 12, borderTop: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name="James Marsden" tint={0} size={36} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: "#0F172A" }}>James M.</div>
          <div style={{ color: "#64748B", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} /> Available</div>
        </div>
        <Icon name="settings" size={14} color="#64748B" />
      </div>
    </aside>
  );
};

const MechTopBar = ({ title, right }) => (
  <header style={{ height: 72, padding: "0 28px", borderBottom: "1px solid #E2E8F0", background: "#fff", display: "flex", alignItems: "center", gap: 16 }}>
    <div style={{ flex: 1 }}>
      <Overline>Mechanic dashboard</Overline>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#0F172A", marginTop: 2 }}>{title}</div>
    </div>
    {right}
    <button style={{ width: 38, height: 38, borderRadius: 10, background: "#F8FAFC", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: "pointer" }}>
      <Icon name="bell" size={16} color="#334155" />
      <span style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: "#EF4444", border: "1.5px solid #fff" }} />
    </button>
  </header>
);

const MechFrame = ({ active, title, children, right }) => (
  <div style={{ width: "100%", height: "100%", display: "flex", background: "#F8FAFC", fontFamily: "Inter, system-ui, sans-serif", color: "#0F172A", fontSize: 13 }}>
    <MechSidebar active={active} />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <MechTopBar title={title} right={right} />
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>{children}</div>
    </div>
  </div>
);

// ----------------------------------------------------------------------------
// MECHANIC SCREEN: LIVE JOBS DASHBOARD
// ----------------------------------------------------------------------------

const MechJobsDashboard = () => (
  <MechFrame active="jobs" title="Today, Wednesday 27 April" right={
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "#DCFCE7", borderRadius: 999 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 0 4px rgba(34,197,94,0.25)" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "#15803D" }}>Available for jobs</span>
      </div>
      <Button variant="ghost" size="sm" icon="sliders">Set radius</Button>
    </div>
  }>
    {/* KPI strip */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
      <KPI label="Today's earnings" value="£284" delta="+£82 vs avg Wed" deltaTone="success" icon="pound" />
      <KPI label="Jobs this week" value="11" delta="2 booked tomorrow" deltaTone="neutral" icon="folder" />
      <KPI label="Acceptance rate" value="94%" delta="↑ 6% this month" deltaTone="success" icon="bolt" />
      <KPI label="Customer rating" value="4.9 ★" delta="312 reviews" deltaTone="neutral" icon="star" />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Live job offers */}
        <Card padded={false}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", boxShadow: "0 0 0 4px rgba(239,68,68,0.2)" }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>New jobs near you</div>
            <Pill tone="error">4 live</Pill>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: "#64748B" }}>Within 8 miles · Auto-refresh</span>
          </div>
          {[
            { svc: "Brake pads (front)", car: "VW Golf · LB21 XYZ", area: "Peckham SE15", dist: "2.4 mi", earn: "£89", time: "Today 12:00", expires: 78, hot: true },
            { svc: "Battery diagnostic", car: "Ford Fiesta · KE19 OPR", area: "Camberwell SE5", dist: "3.1 mi", earn: "£36", time: "Today 14:30", expires: 240 },
            { svc: "Annual service", car: "BMW 320i · DK20 RTS", area: "Brixton SW9", dist: "4.6 mi", earn: "£142", time: "Tomorrow 09:00", expires: 1200 },
            { svc: "Clutch replacement", car: "Vauxhall Corsa · BV18 XCV", area: "Lewisham SE13", dist: "6.2 mi", earn: "£198", time: "Fri 29 · 10:00", expires: 3600 },
          ].map((j, i, arr) => (
            <div key={i} style={{ padding: "16px 20px", borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : 0, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: j.hot ? "#FEE2E2" : "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={j.hot ? "zap" : "wrench"} size={20} color={j.hot ? "#EF4444" : "#2563EB"} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{j.svc}</div>
                  {j.hot && <Pill tone="error" dot>Expires in {Math.floor(j.expires / 60)}m</Pill>}
                </div>
                <div style={{ fontSize: 12, color: "#475569", display: "flex", gap: 12 }}>
                  <span>{j.car}</span><span>·</span>
                  <span><Icon name="pin" size={11} color="#64748B" /> {j.area} · {j.dist}</span><span>·</span>
                  <span>{j.time}</span>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>You earn</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em" }}>{j.earn}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Button variant="ghost" size="sm">Decline</Button>
                <Button variant="primary" size="sm">Accept</Button>
              </div>
            </div>
          ))}
        </Card>

        {/* Today's schedule */}
        <Card padded={false}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Your day</div>
            <span style={{ marginLeft: 10, fontSize: 11, color: "#64748B" }}>3 confirmed jobs · £284 booked</span>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" icon="map">Route view</Button>
          </div>
          <div style={{ padding: "10px 20px 18px" }}>
            {[
              { t: "08:30", l: "MOT pre-check · Mini Cooper", w: "Dulwich SE21 · 1.8 mi", earn: "£39", st: "done" },
              { t: "10:00", l: "Battery replacement · Audi A3", w: "Peckham SE15 · 0.4 mi", earn: "£105", st: "done" },
              { t: "12:00", l: "Brake pads · VW Golf", w: "Peckham SE15 · 0.2 mi", earn: "£89", st: "next" },
              { t: "14:30", l: "Diagnostic · Ford Fiesta", w: "Camberwell SE5 · 3.1 mi", earn: "£36", st: "future" },
              { t: "16:00", l: "Buffer / break", w: "—", earn: "", st: "buffer" },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 14, padding: "10px 0", alignItems: "center", fontSize: 13, borderBottom: i < 4 ? "1px solid #F1F5F9" : 0 }}>
                <div style={{ width: 50, color: "#64748B", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{s.t}</div>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.st === "done" ? "#22C55E" : s.st === "next" ? "#2563EB" : s.st === "buffer" ? "#CBD5E1" : "#94A3B8", flexShrink: 0 }} />
                <div style={{ flex: 1, color: s.st === "buffer" ? "#94A3B8" : "#0F172A", fontWeight: s.st === "next" ? 700 : 500 }}>
                  {s.l}
                  <div style={{ fontSize: 11, color: "#64748B", fontWeight: 400 }}>{s.w}</div>
                </div>
                {s.st === "next" && <Pill tone="active">Next up</Pill>}
                {s.st === "done" && <Pill tone="success">Complete</Pill>}
                {s.earn && <div style={{ fontSize: 14, fontWeight: 700, width: 60, textAlign: "right" }}>{s.earn}</div>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Right column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card padded={false} style={{ overflow: "hidden" }}>
          <div style={{ background: "#0F172A", color: "#fff", padding: 18 }}>
            <Overline style={{ color: "rgba(255,255,255,0.6)" }}>Your service area</Overline>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Peckham + 8 mi</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>32 active customers in this radius</div>
          </div>
          <div style={{ height: 180, background: "linear-gradient(135deg, #DBEAFE, #EFF6FF)", position: "relative" }}>
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 320 180">
              <circle cx="160" cy="90" r="78" fill="#2563EB" fillOpacity="0.12" stroke="#2563EB" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx="160" cy="90" r="6" fill="#2563EB" />
              {[
                [80, 60], [110, 130], [200, 50], [220, 130], [140, 40], [180, 110],
              ].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="4" fill="#22C55E" />
              ))}
            </svg>
          </div>
          <div style={{ padding: 14, fontSize: 12, color: "#475569", display: "flex", justifyContent: "space-between" }}>
            <span>6 mechanics nearby</span>
            <span style={{ color: "#2563EB", fontWeight: 600 }}>Adjust radius</span>
          </div>
        </Card>

        <Card>
          <Overline>This week's earnings</Overline>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", color: "#0F172A", marginTop: 6 }}>£1,284</div>
          <div style={{ fontSize: 12, color: "#15803D", fontWeight: 600 }}>+22% vs last week</div>
          <div style={{ marginTop: 14, height: 80, display: "flex", alignItems: "flex-end", gap: 6 }}>
            {[40, 65, 30, 80, 55, 95, 70].map((h, i) => (
              <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 6 ? "#2563EB" : "#DBEAFE", borderRadius: 4 }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94A3B8", marginTop: 6 }}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <span key={d}>{d}</span>)}
          </div>
          <Button variant="ghost" fullWidth size="sm" style={{ marginTop: 14 }} iconRight="chevron">View earnings breakdown</Button>
        </Card>

        <Card style={{ background: "#EFF6FF", border: "1px solid #DBEAFE" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="sparkle" size={16} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1E3A8A" }}>You're 3 jobs from Pro tier</div>
              <div style={{ fontSize: 12, color: "#1E3A8A", marginTop: 2, lineHeight: 1.5 }}>Pro mechanics get priority on jobs and a 2% lower commission rate.</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  </MechFrame>
);

// ----------------------------------------------------------------------------
// MECHANIC: JOB DETAIL VIEW (web)
// ----------------------------------------------------------------------------

const MechJobDetail = () => (
  <MechFrame active="jobs" title="Job · BMT-94821" right={
    <div style={{ display: "flex", gap: 10 }}>
      <Button variant="ghost" size="sm" icon="message">Message customer</Button>
      <Button variant="primary" size="sm" icon="check">Accept job</Button>
    </div>
  }>
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Hero summary */}
        <Card style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Pill tone="error" dot>Expires in 8 min</Pill>
            <Pill tone="neutral">Brake & suspension</Pill>
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: "#0F172A", marginBottom: 4 }}>Brake pads · front</h2>
          <p style={{ fontSize: 14, color: "#475569", marginBottom: 18 }}>Volkswagen Golf 1.5 TSI (2021) · 42,310 miles</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { k: "When", v: "Thu 28 Apr · 12:00", i: "calendar" },
              { k: "Distance", v: "2.4 mi from you", i: "pin" },
              { k: "Estimated time", v: "60–90 min", i: "clock" },
              { k: "You earn", v: "£89", i: "pound", highlight: true },
            ].map((s, i) => (
              <div key={i} style={{ padding: 14, background: s.highlight ? "#0F172A" : "#F8FAFC", color: s.highlight ? "#fff" : "#0F172A", borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: s.highlight ? "rgba(255,255,255,0.7)" : "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  <Icon name={s.i} size={11} color={s.highlight ? "rgba(255,255,255,0.7)" : "#64748B"} /> {s.k}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>{s.v}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHead eyebrow="Customer notes" title="What the customer said" />
          <p style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, padding: 14, background: "#F8FAFC", borderRadius: 10 }}>
            "Brakes have been squealing for about a week, getting worse. There's a bit of a vibration when I brake hard. I drive about 8,000 miles a year, mostly in town. Car is parked on a flat driveway, side-gate access."
          </p>
          <div style={{ marginTop: 14 }}>
            <Overline>Photos uploaded</Overline>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ width: 80, height: 80, borderRadius: 8, background: "linear-gradient(135deg, #DBEAFE, #E0E7FF)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="car" size={28} color="#2563EB" />
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <SectionHead eyebrow="Parts allocated" title="What you'll fit" right={<Pill tone="success">Parts confirmed</Pill>} />
          {[
            { n: "Brembo P85020 brake pads (front)", q: "1 set", c: "£42", supplied: "BMT supplier" },
            { n: "Brake fluid top-up DOT 4", q: "0.25L", c: "Inc.", supplied: "BMT supplier" },
          ].map((p, i, arr) => (
            <div key={i} style={{ padding: "12px 0", display: "flex", alignItems: "center", gap: 12, borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="bag" size={16} color="#2563EB" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.n}</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>{p.q} · {p.supplied}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{p.c}</div>
            </div>
          ))}
        </Card>
      </div>

      {/* Right rail */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card>
          <Overline>Customer</Overline>
          <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
            <Avatar name="Hannah Roe" tint={3} size={48} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Hannah Roe</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>Member since Jan 2026 · 3 prior bookings</div>
            </div>
          </div>
          <div style={{ marginTop: 14, padding: 12, background: "#F8FAFC", borderRadius: 10, fontSize: 12, color: "#475569" }}>
            <div style={{ fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>34 Rye Lane, Peckham</div>
            <div>SE15 4QF · Driveway · "Use the side gate"</div>
          </div>
          <Button variant="ghost" fullWidth size="sm" style={{ marginTop: 10 }} icon="map">Get directions</Button>
        </Card>

        <Card>
          <Overline>Earnings breakdown</Overline>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            {[
              ["Customer pays", "£139", false],
              ["Parts cost (BMT)", "−£42", false],
              ["Platform fee (15%)", "−£8", false],
              ["You receive", "£89", true],
            ].map(([k, v, b], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", paddingTop: b ? 10 : 0, borderTop: b ? "1px solid #E2E8F0" : 0 }}>
                <span style={{ color: b ? "#0F172A" : "#64748B", fontWeight: b ? 700 : 500 }}>{k}</span>
                <span style={{ fontWeight: b ? 800 : 600, color: "#0F172A", fontSize: b ? 16 : 13 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#64748B", marginTop: 12, padding: 10, background: "#F8FAFC", borderRadius: 8 }}>
            Paid out within 24 hrs of customer sign-off.
          </div>
        </Card>

        <Card style={{ background: "#0F172A", color: "#fff" }}>
          <Overline style={{ color: "rgba(255,255,255,0.6)" }}>Why you're a great match</Overline>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10, fontSize: 12 }}>
            {[
              "Brake & suspension specialist (matches job)",
              "2.4 mi away · zero detour",
              "5★ on your last 14 brake jobs",
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Icon name="check" size={13} color="#22C55E" />
                <span>{r}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  </MechFrame>
);

// ----------------------------------------------------------------------------
// MECHANIC: EARNINGS
// ----------------------------------------------------------------------------

const MechEarnings = () => (
  <MechFrame active="earnings" title="Earnings & payouts">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
      <KPI label="This month" value="£4,820" delta="+£640 vs Mar" deltaTone="success" icon="pound" />
      <KPI label="Jobs completed" value="42" delta="11 this week" deltaTone="neutral" icon="folder" />
      <KPI label="Avg per job" value="£114" delta="↑ £8 vs avg" deltaTone="success" icon="chart" />
      <KPI label="Pending payout" value="£287" delta="Wed 28 Apr" deltaTone="neutral" icon="card" />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
      <Card padded={false}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Earnings · last 30 days</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>£4,820 from 42 jobs</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 4, padding: 4, background: "#F8FAFC", borderRadius: 8, fontSize: 12 }}>
            {["7d", "30d", "90d", "Year"].map((p, i) => (
              <span key={p} style={{ padding: "4px 10px", background: i === 1 ? "#fff" : "transparent", borderRadius: 6, fontWeight: i === 1 ? 700 : 500, color: i === 1 ? "#0F172A" : "#64748B", boxShadow: i === 1 ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>{p}</span>
            ))}
          </div>
        </div>
        <div style={{ padding: 22, height: 260 }}>
          <svg width="100%" height="100%" viewBox="0 0 600 240" preserveAspectRatio="none">
            {[40, 80, 120, 160, 200].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#F1F5F9" strokeWidth="1" />)}
            <path d="M0,180 L40,150 L80,170 L120,120 L160,140 L200,90 L240,110 L280,80 L320,100 L360,60 L400,75 L440,40 L480,55 L520,30 L560,45 L600,20" stroke="#2563EB" strokeWidth="3" fill="none" />
            <path d="M0,180 L40,150 L80,170 L120,120 L160,140 L200,90 L240,110 L280,80 L320,100 L360,60 L400,75 L440,40 L480,55 L520,30 L560,45 L600,20 L600,240 L0,240 Z" fill="url(#earn-grad)" opacity="0.25" />
            <defs>
              <linearGradient id="earn-grad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </Card>

      <Card padded={false}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #E2E8F0", fontSize: 15, fontWeight: 700 }}>Recent payouts</div>
        {[
          { d: "21 Apr", amt: "£312", st: "Paid" },
          { d: "14 Apr", amt: "£428", st: "Paid" },
          { d: "07 Apr", amt: "£396", st: "Paid" },
          { d: "31 Mar", amt: "£284", st: "Paid" },
          { d: "Pending", amt: "£287", st: "Wed" },
        ].map((p, i, arr) => (
          <div key={i} style={{ padding: "14px 22px", display: "flex", alignItems: "center", borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: p.st === "Paid" ? "#DCFCE7" : "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <Icon name={p.st === "Paid" ? "check" : "clock"} size={14} color={p.st === "Paid" ? "#15803D" : "#B45309"} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.d}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>To Lloyds ••3402</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{p.amt}</div>
              <Pill tone={p.st === "Paid" ? "success" : "pending"} style={{ marginTop: 2 }}>{p.st}</Pill>
            </div>
          </div>
        ))}
      </Card>
    </div>
  </MechFrame>
);

// ----------------------------------------------------------------------------
// MECHANIC: AVAILABILITY & RADIUS SETTINGS
// ----------------------------------------------------------------------------

const MechAvailability = () => (
  <MechFrame active="settings" title="Availability & service area">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <Card>
        <SectionHead eyebrow="Working hours" title="When you accept jobs" />
        <div style={{ marginTop: 8 }}>
          {[
            { d: "Monday", on: true, h: "08:00 – 18:00" },
            { d: "Tuesday", on: true, h: "08:00 – 18:00" },
            { d: "Wednesday", on: true, h: "08:00 – 18:00" },
            { d: "Thursday", on: true, h: "08:00 – 18:00" },
            { d: "Friday", on: true, h: "08:00 – 17:00" },
            { d: "Saturday", on: true, h: "09:00 – 14:00" },
            { d: "Sunday", on: false, h: "Off" },
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: i < 6 ? "1px solid #F1F5F9" : 0 }}>
              <div style={{ width: 110, fontSize: 13, fontWeight: 600 }}>{row.d}</div>
              <div style={{ flex: 1, fontSize: 13, color: row.on ? "#0F172A" : "#94A3B8" }}>{row.h}</div>
              <div style={{ width: 36, height: 20, borderRadius: 999, background: row.on ? "#2563EB" : "#E2E8F0", position: "relative", cursor: "pointer" }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: row.on ? 18 : 2, transition: "left 150ms" }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card padded={false}>
        <div style={{ padding: 20, borderBottom: "1px solid #E2E8F0" }}>
          <SectionHead eyebrow="Service radius" title="How far you'll travel" />
          <div style={{ fontSize: 14, color: "#475569", marginBottom: 16 }}>You're matched to jobs within this circle. Larger = more jobs, longer drives.</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", color: "#2563EB" }}>8</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#64748B" }}>miles from SE15</span>
          </div>
          <input type="range" defaultValue="40" style={{ width: "100%", marginTop: 16, accentColor: "#2563EB" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
            <span>2 mi</span><span>10 mi</span><span>20 mi</span>
          </div>
        </div>
        <div style={{ height: 220, background: "linear-gradient(135deg, #DBEAFE, #EFF6FF)", position: "relative" }}>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 400 220">
            <circle cx="200" cy="110" r="100" fill="#2563EB" fillOpacity="0.12" stroke="#2563EB" strokeWidth="1.5" strokeDasharray="4 4" />
            <circle cx="200" cy="110" r="6" fill="#2563EB" />
            {[[100, 80], [140, 160], [260, 70], [280, 160], [180, 60], [220, 140], [60, 120], [330, 110]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="4" fill="#22C55E" />
            ))}
          </svg>
        </div>
        <div style={{ padding: 16, fontSize: 12, color: "#475569", display: "flex", justifyContent: "space-between" }}>
          <span><strong style={{ color: "#0F172A" }}>32</strong> active customers in radius</span>
          <span><strong style={{ color: "#0F172A" }}>~£1,200</strong> avg weekly earning potential</span>
        </div>
      </Card>

      <Card style={{ gridColumn: "span 2" }}>
        <SectionHead eyebrow="Services you offer" title="Your specialisms" right={<Button variant="secondary" size="sm" icon="plus">Add specialism</Button>} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 8 }}>
          {[
            { l: "Brakes", on: true, jobs: 142 },
            { l: "Suspension", on: true, jobs: 64 },
            { l: "Diagnostics", on: true, jobs: 98 },
            { l: "Battery", on: true, jobs: 31 },
            { l: "Service & MOT prep", on: true, jobs: 57 },
            { l: "Clutch", on: false, jobs: 0 },
            { l: "Cambelt", on: false, jobs: 0 },
            { l: "Air-con regas", on: false, jobs: 0 },
          ].map((s, i) => (
            <div key={i} style={{ padding: 14, border: s.on ? "1.5px solid #2563EB" : "1px solid #E2E8F0", borderRadius: 12, background: s.on ? "#EFF6FF" : "#fff", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: s.on ? "#2563EB" : "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="wrench" size={14} color={s.on ? "#fff" : "#94A3B8"} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{s.l}</div>
                {s.on && <div style={{ fontSize: 11, color: "#64748B" }}>{s.jobs} jobs</div>}
                {!s.on && <div style={{ fontSize: 11, color: "#94A3B8" }}>Not offered</div>}
              </div>
              {s.on && <Icon name="check" size={14} color="#22C55E" />}
            </div>
          ))}
        </div>
      </Card>
    </div>
  </MechFrame>
);

// ----------------------------------------------------------------------------
// MECHANIC MOBILE APP — phone-frame, 375 wide
// ----------------------------------------------------------------------------

const MechMobileShell = ({ children, title, action, dark }) => (
  <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: dark ? "#0F172A" : "#F8FAFC", fontFamily: "Inter, system-ui, sans-serif", color: dark ? "#fff" : "#0F172A" }}>
    <div style={{ padding: "14px 18px", background: dark ? "#0F172A" : "#fff", borderBottom: dark ? "none" : "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
      <img src="assets/logo-no-bg.png" alt="Book My Tech" style={{ height: 30, display: "block", filter: dark ? "brightness(0) invert(1)" : "none" }} />
      <div style={{ flex: 1, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", textAlign: "right" }}>{title}</div>
      {action || (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: dark ? "rgba(34,197,94,0.18)" : "#DCFCE7", borderRadius: 999 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: dark ? "#86EFAC" : "#15803D" }}>Online</span>
        </div>
      )}
    </div>
    <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
    {/* Bottom nav */}
    <div style={{ display: "flex", background: dark ? "#0F172A" : "#fff", borderTop: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #E2E8F0", padding: "6px 0 12px", flexShrink: 0 }}>
      {[
        { i: "inbox", l: "Jobs", on: true },
        { i: "calendar", l: "Schedule" },
        { i: "pound", l: "Earnings" },
        { i: "star", l: "Reviews" },
        { i: "user", l: "Me" },
      ].map(t => (
        <div key={t.l} style={{ flex: 1, textAlign: "center", padding: "6px 0 0" }}>
          <div style={{ display: "inline-flex", padding: t.on ? "5px 12px" : 0, borderRadius: 999, background: t.on ? "#EFF6FF" : "transparent" }}>
            <Icon name={t.i} size={18} color={t.on ? "#2563EB" : (dark ? "rgba(255,255,255,0.5)" : "#94A3B8")} />
          </div>
          <div style={{ fontSize: 10, fontWeight: t.on ? 700 : 500, color: t.on ? "#2563EB" : (dark ? "rgba(255,255,255,0.5)" : "#94A3B8"), marginTop: 4 }}>{t.l}</div>
        </div>
      ))}
    </div>
  </div>
);

// Mobile: incoming job offer
const MechMobileOffer = () => (
  <MechMobileShell title="New job">
    <div style={{ padding: 18 }}>
      <Card style={{ padding: 0, overflow: "hidden", border: "1.5px solid #2563EB" }}>
        <div style={{ background: "#0F172A", color: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", boxShadow: "0 0 0 4px rgba(239,68,68,0.25)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>New offer · expires in 1:48</span>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>BMT-94821 · Brake & suspension</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 4 }}>Brake pads · front</div>
          <div style={{ fontSize: 13, color: "#475569" }}>VW Golf · 1.5 TSI · 2021</div>

          <div style={{ marginTop: 16, padding: 16, background: "linear-gradient(135deg, #1E3A8A, #2563EB)", borderRadius: 12, color: "#fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.06em" }}>You earn</div>
            <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 2 }}>£89</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>Customer pays £139 · parts + 15% fee deducted</div>
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { i: "calendar", k: "When", v: "Thu 12:00" },
              { i: "clock", k: "Duration", v: "60–90 min" },
              { i: "pin", k: "Distance", v: "2.4 mi" },
              { i: "user", k: "Customer", v: "Hannah · 4.9★" },
            ].map((s, i) => (
              <div key={i} style={{ padding: 12, background: "#F8FAFC", borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <Icon name={s.i} size={11} color="#64748B" /> {s.k}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{s.v}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, padding: 12, background: "#EFF6FF", borderRadius: 10, fontSize: 12, color: "#1E3A8A", lineHeight: 1.5 }}>
            <strong>Customer note: </strong> "Brakes squealing for a week. Parked on driveway, side-gate access."
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <Button variant="ghost" fullWidth size="lg">Decline</Button>
            <Button variant="primary" fullWidth size="lg" icon="check">Accept job</Button>
          </div>
          <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, color: "#64748B" }}>
            View full job details
          </div>
        </div>
      </Card>
    </div>
  </MechMobileShell>
);

// Mobile: job in progress
const MechMobileInProgress = () => (
  <MechMobileShell title="Live job" action={<Pill tone="active" dot>In progress</Pill>}>
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Customer card */}
      <Card style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name="Hannah Roe" tint={3} size={42} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Hannah Roe</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>34 Rye Lane, SE15 4QF · 0.4 mi</div>
          </div>
          <Button variant="primary" size="sm" icon="phone" style={{ padding: "0 10px" }} />
          <Button variant="ghost" size="sm" icon="message" style={{ padding: "0 10px" }} />
        </div>
      </Card>

      {/* Progress steps */}
      <Card padded={false}>
        <div style={{ padding: 16, borderBottom: "1px solid #F1F5F9", fontSize: 13, fontWeight: 700 }}>Job progress</div>
        {[
          { t: "On the way", d: "Arrived 11:55", done: true },
          { t: "Inspection", d: "Confirmed brake pads worn", done: true },
          { t: "Work in progress", d: "Started 12:08", active: true },
          { t: "Quality check & cleanup", d: "—", future: true },
          { t: "Complete & charge", d: "Customer signs off in app", future: true },
        ].map((s, i, arr) => (
          <div key={i} style={{ padding: "14px 16px", display: "flex", gap: 12, borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : 0 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: s.done ? "#22C55E" : s.active ? "#2563EB" : "#F1F5F9", color: s.done || s.active ? "#fff" : "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {s.done ? <Icon name="check" size={11} color="#fff" /> : i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: s.active ? 700 : 500, color: s.future ? "#94A3B8" : "#0F172A" }}>{s.t}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>{s.d}</div>
            </div>
          </div>
        ))}
        <div style={{ padding: 16 }}>
          <Button variant="primary" fullWidth size="lg" icon="check">Mark step complete</Button>
        </div>
      </Card>

      <Card style={{ padding: 14, background: "#0F172A", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>You'll earn</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>£89</div>
          </div>
          <Pill tone="dark" style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}>Paid 24h after sign-off</Pill>
        </div>
      </Card>
    </div>
  </MechMobileShell>
);

// Mobile: home / day view
const MechMobileDay = () => (
  <MechMobileShell title="Today">
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 12, color: "#64748B" }}>Wed 27 Apr</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 2 }}>Morning, James.</h1>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>3 jobs lined up · £284 booked</p>
      </div>

      {/* Earnings ring */}
      <Card style={{ padding: 18, background: "linear-gradient(135deg, #1E3A8A, #2563EB)", color: "#fff", border: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 70, height: 70, borderRadius: "50%", border: "5px solid rgba(255,255,255,0.25)", borderTopColor: "#FBBF24", borderRightColor: "#FBBF24", display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(45deg)" }}>
            <span style={{ fontSize: 13, fontWeight: 800, transform: "rotate(-45deg)" }}>62%</span>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Today's goal</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>£284 / £450</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>2 more jobs to hit it</div>
          </div>
        </div>
      </Card>

      <Overline>Up next</Overline>
      {[
        { t: "12:00", l: "Brake pads · VW Golf", w: "Peckham · 0.2 mi", earn: "£89", on: true },
        { t: "14:30", l: "Diagnostic · Ford Fiesta", w: "Camberwell · 3.1 mi", earn: "£36" },
        { t: "16:00", l: "Annual service · BMW 320i", w: "Brixton · 4.6 mi", earn: "£142" },
      ].map((j, i) => (
        <Card key={i} style={{ padding: 14, border: j.on ? "1.5px solid #2563EB" : "1px solid #E2E8F0", background: j.on ? "#EFF6FF" : "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 50, textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em" }}>{j.t}</div>
              {j.on && <div style={{ fontSize: 9, fontWeight: 700, color: "#2563EB", marginTop: 2 }}>NEXT</div>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{j.l}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>{j.w}</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em" }}>{j.earn}</div>
          </div>
        </Card>
      ))}
    </div>
  </MechMobileShell>
);

Object.assign(window, {
  MechFrame, MechSidebar,
  MechJobsDashboard, MechJobDetail, MechEarnings, MechAvailability,
  MechMobileShell, MechMobileOffer, MechMobileInProgress, MechMobileDay,
});
