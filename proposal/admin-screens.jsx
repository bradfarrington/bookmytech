// Admin dashboard — desktop only, 1280×800.
// Operations: monitor jobs, approve mechanics, review docs, manage pricing, view analytics.

const AdminSidebar = ({ active = "overview" }) => {
  const sections = [
    { h: "Operations", items: [
      { id: "overview", label: "Overview", icon: "home" },
      { id: "jobs", label: "All jobs", icon: "folder", badge: 142 },
      { id: "live", label: "Live monitor", icon: "activity" },
      { id: "disputes", label: "Disputes", icon: "alert", badge: 3 },
    ]},
    { h: "Network", items: [
      { id: "mechanics", label: "Mechanics", icon: "users" },
      { id: "approvals", label: "Approvals", icon: "shield", badge: 7 },
      { id: "documents", label: "Documents", icon: "file" },
    ]},
    { h: "Commercial", items: [
      { id: "pricing", label: "Pricing", icon: "pound" },
      { id: "areas", label: "Areas & demand", icon: "map" },
      { id: "analytics", label: "Analytics", icon: "chart" },
    ]},
  ];
  return (
    <aside style={{ width: 240, background: "#0F172A", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "20px 18px", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", height: 104, boxSizing: "border-box" }}>
        <img src="assets/logo-no-bg.png" alt="Book My Tech" style={{ height: 72, maxWidth: "100%", display: "block", filter: "brightness(0) invert(1)" }} />
      </div>
      <nav style={{ padding: 10, flex: 1, overflow: "auto" }}>
        {sections.map(sec => (
          <div key={sec.h} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", padding: "6px 12px" }}>{sec.h}</div>
            {sec.items.map(it => {
              const on = it.id === active;
              return (
                <div key={it.id} style={{
                  padding: "9px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 10,
                  background: on ? "#2563EB" : "transparent",
                  color: on ? "#fff" : "#CBD5E1",
                  fontSize: 13, fontWeight: on ? 600 : 500, marginBottom: 1,
                }}>
                  <Icon name={it.icon} size={15} color={on ? "#fff" : "#94A3B8"} />
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {it.badge && <span style={{ background: on ? "rgba(255,255,255,0.18)" : "#FEE2E2", color: on ? "#fff" : "#B91C1C", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999 }}>{it.badge}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name="Operations" tint={4} size={32} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
          <div style={{ color: "#fff", fontWeight: 600 }}>Olivia Hart</div>
          <div style={{ color: "#94A3B8", fontSize: 11 }}>Ops manager</div>
        </div>
        <Icon name="settings" size={14} color="#94A3B8" />
      </div>
    </aside>
  );
};

const AdminTopBar = ({ crumbs = [], right }) => (
  <header style={{ height: 72, padding: "0 28px", borderBottom: "1px solid #E2E8F0", background: "#fff", display: "flex", alignItems: "center", gap: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Icon name="chevron" size={12} color="#94A3B8" />}
          <span style={{ color: i === crumbs.length - 1 ? "#0F172A" : "#64748B", fontWeight: i === crumbs.length - 1 ? 700 : 500 }}>{c}</span>
        </React.Fragment>
      ))}
    </div>
    <div style={{ flex: 1 }} />
    <div style={{ position: "relative", width: 320 }}>
      <div style={{ position: "absolute", left: 12, top: 11 }}><Icon name="search" size={14} color="#94A3B8" /></div>
      <input readOnly placeholder="Search bookings, mechanics, customers…" style={{ width: "100%", height: 38, border: "1px solid #E2E8F0", borderRadius: 8, padding: "0 12px 0 36px", fontSize: 13, fontFamily: "inherit", background: "#F8FAFC", color: "#475569" }} />
      <span style={{ position: "absolute", right: 8, top: 9, fontSize: 10, color: "#64748B", background: "#fff", border: "1px solid #E2E8F0", padding: "2px 6px", borderRadius: 4 }}>⌘K</span>
    </div>
    {right}
    <button style={{ width: 38, height: 38, borderRadius: 10, background: "#F8FAFC", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
      <Icon name="bell" size={15} color="#334155" />
      <span style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: "#EF4444", border: "1.5px solid #fff" }} />
    </button>
  </header>
);

const AdminFrame = ({ active, crumbs, children, topRight }) => (
  <div style={{ width: "100%", height: "100%", display: "flex", background: "#F8FAFC", fontFamily: "Inter, system-ui, sans-serif", color: "#0F172A", fontSize: 13 }}>
    <AdminSidebar active={active} />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <AdminTopBar crumbs={crumbs} right={topRight} />
      <div style={{ flex: 1, overflow: "auto", padding: 28 }}>{children}</div>
    </div>
  </div>
);

// ----------------------------------------------------------------------------
// ADMIN: OVERVIEW (homepage of the admin console)
// ----------------------------------------------------------------------------

const AdminOverview = () => (
  <AdminFrame active="overview" crumbs={["Operations", "Overview"]} topRight={<Button variant="primary" size="sm" icon="download">Export</Button>}>
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22 }}>
      <div>
        <Overline>Wednesday, 27 April · 14:22</Overline>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginTop: 4, letterSpacing: "-0.02em" }}>Today's marketplace, at a glance.</h1>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 22 }}>
      <KPI label="Live bookings" value="142" delta="+18% on last Wed" deltaTone="success" icon="folder" />
      <KPI label="GMV today" value="£18.4k" delta="+£3.1k" deltaTone="success" icon="pound" />
      <KPI label="Take-rate" value="15.2%" delta="On target" deltaTone="success" icon="chart" />
      <KPI label="Mechanics online" value="318" delta="of 412 active" deltaTone="neutral" icon="users" />
      <KPI label="Avg time-to-accept" value="42s" delta="↓ 18s vs avg" deltaTone="success" icon="clock" />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
      {/* Live monitor */}
      <Card padded={false}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 0 4px rgba(34,197,94,0.2)" }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Live monitor</div>
          <Pill tone="success">12 in progress</Pill>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" icon="filter">Filter</Button>
        </div>
        {[
          { id: "BMT-94821", svc: "Brake pads", cust: "Hannah R.", mech: "James M.", area: "Peckham", st: "Mechanic en route", stTone: "active", val: "£139" },
          { id: "BMT-94818", svc: "Annual service", cust: "Marcus K.", mech: "Priya S.", area: "Brixton", st: "In progress", stTone: "info", val: "£189" },
          { id: "BMT-94816", svc: "Battery", cust: "Sasha T.", mech: "Tom W.", area: "Hackney", st: "In progress", stTone: "info", val: "£124" },
          { id: "BMT-94810", svc: "Diagnostic", cust: "Aaron L.", mech: "Awaiting accept", area: "Camden", st: "Sourcing mechanic", stTone: "pending", val: "£45" },
          { id: "BMT-94807", svc: "Clutch", cust: "Mei W.", mech: "Awaiting accept", area: "Croydon", st: "Sourcing mechanic", stTone: "pending", val: "£298" },
          { id: "BMT-94804", svc: "MOT prep", cust: "Daniel F.", mech: "Lucas O.", area: "Greenwich", st: "Complete · awaiting sign-off", stTone: "success", val: "£59" },
        ].map((r, i, arr) => (
          <div key={i} style={{ padding: "14px 22px", display: "grid", gridTemplateColumns: "100px 1.2fr 1fr 1fr 1.3fr 70px", gap: 10, alignItems: "center", borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : 0, fontSize: 13 }}>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#64748B" }}>{r.id}</div>
            <div>
              <div style={{ fontWeight: 600 }}>{r.svc}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>{r.area}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Avatar name={r.cust} tint={i + 1} size={26} />
              <span style={{ fontSize: 12 }}>{r.cust}</span>
            </div>
            <div style={{ fontSize: 12, color: r.mech.startsWith("Awaiting") ? "#B45309" : "#0F172A" }}>{r.mech}</div>
            <Pill tone={r.stTone} dot>{r.st}</Pill>
            <div style={{ textAlign: "right", fontWeight: 700 }}>{r.val}</div>
          </div>
        ))}
      </Card>

      {/* Right column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="alert" size={16} color="#B91C1C" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Needs your attention</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>3 items flagged</div>
            </div>
          </div>
          {[
            { t: "Croydon area · low coverage", d: "12 jobs unmatched in last hour. Recruit 2 mechanics?", tone: "error" },
            { t: "Tom W. — 2nd late arrival", d: "Auto-flagged. Review this week.", tone: "pending" },
            { t: "Dispute · BMT-94601", d: "Customer requesting partial refund.", tone: "error" },
          ].map((a, i) => (
            <div key={i} style={{ padding: 12, borderRadius: 10, background: a.tone === "error" ? "#FEE2E2" : "#FEF3C7", marginBottom: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: a.tone === "error" ? "#B91C1C" : "#B45309" }}>{a.t}</div>
              <div style={{ color: a.tone === "error" ? "#7F1D1D" : "#78350F", marginTop: 2 }}>{a.d}</div>
            </div>
          ))}
        </Card>

        <Card>
          <Overline>Demand by area · today</Overline>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { a: "Peckham SE15", n: 24, m: 8 },
              { a: "Brixton SW9", n: 18, m: 6 },
              { a: "Camden NW1", n: 14, m: 4 },
              { a: "Croydon CR0", n: 12, m: 1, hot: true },
              { a: "Hackney E8", n: 11, m: 5 },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                <div style={{ width: 110, fontWeight: 600 }}>{r.a}</div>
                <div style={{ flex: 1, height: 8, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${r.n * 4}%`, height: "100%", background: r.hot ? "#EF4444" : "#2563EB" }} />
                </div>
                <div style={{ width: 100, fontSize: 11, color: r.hot ? "#B91C1C" : "#64748B", textAlign: "right" }}>
                  {r.n} jobs · {r.m} mech {r.hot && "⚠"}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  </AdminFrame>
);

// ----------------------------------------------------------------------------
// ADMIN: JOB MONITORING TABLE (full)
// ----------------------------------------------------------------------------

const AdminJobs = () => (
  <AdminFrame active="jobs" crumbs={["Operations", "All jobs"]} topRight={<div style={{ display: "flex", gap: 8 }}><Button variant="ghost" size="sm" icon="download">Export</Button><Button variant="primary" size="sm" icon="plus">Manual booking</Button></div>}>
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
      <div>
        <Overline>1,284 jobs · last 30 days</Overline>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", marginTop: 4, letterSpacing: "-0.02em" }}>Job monitoring</h1>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {["All", "Live", "Pending", "Complete", "Disputed"].map((t, i) => (
          <span key={t} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: i === 1 ? "#0F172A" : "#fff", color: i === 1 ? "#fff" : "#475569", border: "1px solid " + (i === 1 ? "#0F172A" : "#E2E8F0"), cursor: "pointer" }}>{t}</span>
        ))}
      </div>
    </div>

    {/* Filters */}
    <Card padded={false} style={{ marginBottom: 16 }}>
      <div style={{ padding: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {[
          { l: "Date: Last 7 days", i: "calendar" },
          { l: "Area: All", i: "pin" },
          { l: "Service: All", i: "wrench" },
          { l: "Mechanic: Any", i: "user" },
          { l: "Status: Live", i: "filter", on: true },
        ].map(f => (
          <span key={f.l} style={{ padding: "8px 12px", border: f.on ? "1.5px solid #2563EB" : "1px solid #E2E8F0", borderRadius: 8, background: f.on ? "#EFF6FF" : "#fff", color: f.on ? "#1E3A8A" : "#475569", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name={f.i} size={12} color={f.on ? "#2563EB" : "#64748B"} />
            {f.l}
            <Icon name="chevDown" size={11} color="#94A3B8" />
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon="x">Clear</Button>
      </div>
    </Card>

    <Card padded={false}>
      <div style={{ padding: "12px 22px", borderBottom: "1px solid #E2E8F0", display: "grid", gridTemplateColumns: "120px 1.4fr 1.2fr 1.2fr 110px 1fr 100px 24px", gap: 10, fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        <div>Job ID</div>
        <div>Service</div>
        <div>Customer</div>
        <div>Mechanic</div>
        <div>Booked</div>
        <div>Status</div>
        <div style={{ textAlign: "right" }}>Value</div>
        <div></div>
      </div>
      {[
        { id: "BMT-94821", svc: "Brake pads · VW Golf", cust: "Hannah R.", area: "Peckham", mech: "James M.", booked: "Today 09:14", st: "En route", stTone: "active", val: "£139" },
        { id: "BMT-94820", svc: "Annual service · Audi A3", cust: "Daniel F.", area: "Greenwich", mech: "Lucas O.", booked: "Today 08:42", st: "In progress", stTone: "info", val: "£189" },
        { id: "BMT-94818", svc: "Annual service · Mini", cust: "Marcus K.", area: "Brixton", mech: "Priya S.", booked: "Today 08:10", st: "In progress", stTone: "info", val: "£189" },
        { id: "BMT-94816", svc: "Battery · Ford Focus", cust: "Sasha T.", area: "Hackney", mech: "Tom W.", booked: "Today 07:55", st: "In progress", stTone: "info", val: "£124" },
        { id: "BMT-94814", svc: "Diagnostic · Toyota Auris", cust: "Charlie M.", area: "Lewisham", mech: "James M.", booked: "Yest 17:20", st: "Complete", stTone: "success", val: "£45" },
        { id: "BMT-94810", svc: "Diagnostic · Skoda Fabia", cust: "Aaron L.", area: "Camden", mech: "—", booked: "Today 13:45", st: "Sourcing", stTone: "pending", val: "£45" },
        { id: "BMT-94807", svc: "Clutch · Vauxhall Corsa", cust: "Mei W.", area: "Croydon", mech: "—", booked: "Today 13:12", st: "Sourcing", stTone: "pending", val: "£298" },
        { id: "BMT-94801", svc: "Brake fluid · Honda Civic", cust: "Yusuf K.", area: "Wembley", mech: "Aisha N.", booked: "Yest 14:00", st: "Complete", stTone: "success", val: "£89" },
        { id: "BMT-94797", svc: "MOT prep · Mini", cust: "Tara P.", area: "Tottenham", mech: "Lucas O.", booked: "Yest 11:30", st: "Complete", stTone: "success", val: "£59" },
        { id: "BMT-94793", svc: "Cambelt · Ford Focus", cust: "Riley T.", area: "Croydon", mech: "Nico A.", booked: "Mon 09:14", st: "Disputed", stTone: "error", val: "£420" },
      ].map((r, i, arr) => (
        <div key={i} style={{ padding: "12px 22px", display: "grid", gridTemplateColumns: "120px 1.4fr 1.2fr 1.2fr 110px 1fr 100px 24px", gap: 10, alignItems: "center", borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : 0, fontSize: 13 }}>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#475569" }}>{r.id}</div>
          <div>
            <div style={{ fontWeight: 600 }}>{r.svc}</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>{r.area}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Avatar name={r.cust} tint={i + 1} size={24} />
            <span style={{ fontSize: 12 }}>{r.cust}</span>
          </div>
          <div style={{ fontSize: 12, color: r.mech === "—" ? "#B45309" : "#0F172A", fontWeight: r.mech === "—" ? 600 : 500 }}>{r.mech}</div>
          <div style={{ fontSize: 11, color: "#64748B" }}>{r.booked}</div>
          <Pill tone={r.stTone} dot>{r.st}</Pill>
          <div style={{ textAlign: "right", fontWeight: 700 }}>{r.val}</div>
          <Icon name="chevron" size={14} color="#94A3B8" />
        </div>
      ))}
    </Card>
  </AdminFrame>
);

// ----------------------------------------------------------------------------
// ADMIN: MECHANIC APPROVALS
// ----------------------------------------------------------------------------

const AdminApprovals = () => (
  <AdminFrame active="approvals" crumbs={["Network", "Approvals"]}>
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
      <div>
        <Overline>7 mechanics waiting</Overline>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", marginTop: 4, letterSpacing: "-0.02em" }}>Mechanic approvals</h1>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[{ l: "Pending", n: 7, on: true }, { l: "In review", n: 3 }, { l: "Approved", n: 412 }, { l: "Rejected", n: 12 }].map(t => (
          <span key={t.l} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: t.on ? "#0F172A" : "#fff", color: t.on ? "#fff" : "#475569", border: "1px solid " + (t.on ? "#0F172A" : "#E2E8F0"), display: "flex", alignItems: "center", gap: 6 }}>
            {t.l} <span style={{ background: t.on ? "rgba(255,255,255,0.2)" : "#F1F5F9", color: t.on ? "#fff" : "#64748B", padding: "1px 6px", borderRadius: 999, fontSize: 10 }}>{t.n}</span>
          </span>
        ))}
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 18 }}>
      {/* Queue */}
      <Card padded={false}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", fontSize: 13, fontWeight: 700 }}>Queue · oldest first</div>
        {[
          { n: "Daniel Foster", area: "Manchester M3", days: 4, complete: 100, on: true, exp: "12 yrs" },
          { n: "Aisha Nour", area: "Birmingham B2", days: 3, complete: 100, exp: "8 yrs" },
          { n: "Lewis Tanaka", area: "Sheffield S1", days: 2, complete: 80, exp: "5 yrs" },
          { n: "Priya Singh", area: "Bristol BS5", days: 2, complete: 100, exp: "9 yrs" },
          { n: "Carlos Reyes", area: "Glasgow G2", days: 1, complete: 60, exp: "3 yrs" },
        ].map((m, i, arr) => (
          <div key={i} style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, background: m.on ? "#EFF6FF" : "#fff", borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : 0, borderLeft: m.on ? "3px solid #2563EB" : "3px solid transparent" }}>
            <Avatar name={m.n} tint={i} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{m.n}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>{m.area} · {m.exp} experience</div>
              <div style={{ marginTop: 6, height: 4, background: "#E2E8F0", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${m.complete}%`, height: "100%", background: m.complete === 100 ? "#22C55E" : "#F59E0B" }} />
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11 }}>
              <div style={{ color: m.days > 3 ? "#B91C1C" : "#64748B", fontWeight: 600 }}>{m.days}d ago</div>
              <div style={{ color: "#94A3B8" }}>{m.complete}% docs</div>
            </div>
          </div>
        ))}
      </Card>

      {/* Detail */}
      <Card padded={false}>
        <div style={{ padding: 22, borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name="Daniel Foster" tint={0} size={64} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Daniel Foster</h2>
                <Pill tone="pending">Pending review</Pill>
              </div>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
                Manchester M3 · 12 yrs experience · Specialism: Brakes, Diagnostics, Service
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="ghost" size="sm" icon="x">Reject</Button>
              <Button variant="primary" size="sm" icon="check">Approve mechanic</Button>
            </div>
          </div>
        </div>

        <div style={{ padding: 22 }}>
          <Overline>Verification checklist</Overline>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { l: "ID document (Driving licence)", st: "ok", uploaded: "Verified · 22 Apr" },
              { l: "Public liability insurance", st: "ok", uploaded: "Valid until Mar 2027" },
              { l: "DBS basic check", st: "ok", uploaded: "Issued 3 Mar 2026" },
              { l: "Trade qualification (NVQ Lvl 3)", st: "ok", uploaded: "Verified · 22 Apr" },
              { l: "Bank account & VAT details", st: "ok", uploaded: "Verified · 23 Apr" },
              { l: "Reference 1 (previous workshop)", st: "ok", uploaded: "Glowing reference" },
              { l: "Reference 2 (independent)", st: "warn", uploaded: "Awaiting reply" },
            ].map((row, i) => {
              const tones = {
                ok: { bg: "#DCFCE7", fg: "#15803D", icon: "check" },
                warn: { bg: "#FEF3C7", fg: "#B45309", icon: "clock" },
                err: { bg: "#FEE2E2", fg: "#B91C1C", icon: "x" },
              };
              const t = tones[row.st];
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "#F8FAFC", borderRadius: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: t.bg, color: t.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={t.icon} size={13} color={t.fg} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{row.l}</div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>{row.uploaded}</div>
                  </div>
                  <Button variant="ghost" size="sm" icon="eye">View</Button>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 18, padding: 14, background: "#EFF6FF", border: "1px solid #DBEAFE", borderRadius: 10, display: "flex", gap: 10 }}>
            <Icon name="info" size={16} color="#2563EB" />
            <div style={{ fontSize: 12, color: "#1E3A8A", lineHeight: 1.5 }}>
              <strong>Auto-screen passed.</strong> ID, insurance and DBS verified by our partners. One reference outstanding — usually returned within 48 hrs.
            </div>
          </div>
        </div>
      </Card>
    </div>
  </AdminFrame>
);

// ----------------------------------------------------------------------------
// ADMIN: PRICING MANAGEMENT
// ----------------------------------------------------------------------------

const AdminPricing = () => (
  <AdminFrame active="pricing" crumbs={["Commercial", "Pricing"]} topRight={<Button variant="primary" size="sm" icon="check">Save changes</Button>}>
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
      <div>
        <Overline>14 services · 9 areas · 26 active rules</Overline>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", marginTop: 4, letterSpacing: "-0.02em" }}>Pricing controls</h1>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 18 }}>
      <Card>
        <Overline>Base pricing rules</Overline>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { svc: "Brake pads (front)", base: "£139", dur: "60–90m" },
            { svc: "Brake pads (rear)", base: "£124", dur: "60m" },
            { svc: "Annual service", base: "£189", dur: "120m" },
            { svc: "Battery replacement", base: "£124", dur: "30m" },
            { svc: "Diagnostic", base: "£45", dur: "45m", featured: true },
            { svc: "MOT prep", base: "£59", dur: "60m" },
            { svc: "Clutch replacement", base: "£298", dur: "240m" },
          ].map((r, i) => (
            <div key={i} style={{ padding: 12, border: r.featured ? "1.5px solid #2563EB" : "1px solid #E2E8F0", borderRadius: 10, background: r.featured ? "#EFF6FF" : "#fff", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: r.featured ? "#2563EB" : "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="wrench" size={14} color={r.featured ? "#fff" : "#64748B"} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{r.svc}</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>{r.dur}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{r.base}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card padded={false}>
        <div style={{ padding: 18, borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="wrench" size={16} color="#2563EB" />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>Diagnostic</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>Editing area-based pricing</div>
            </div>
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <Overline>Base rate</Overline>
          <div style={{ display: "flex", gap: 10, marginTop: 8, marginBottom: 22 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Customer pays</div>
              <div style={{ height: 48, padding: "0 14px", border: "1px solid #E2E8F0", borderRadius: 8, display: "flex", alignItems: "center", fontSize: 16, fontWeight: 700 }}>£45.00</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Mechanic earns</div>
              <div style={{ height: 48, padding: "0 14px", border: "1px solid #E2E8F0", borderRadius: 8, display: "flex", alignItems: "center", fontSize: 16, fontWeight: 700, background: "#F8FAFC" }}>£36.00</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Take-rate</div>
              <div style={{ height: 48, padding: "0 14px", border: "1px solid #E2E8F0", borderRadius: 8, display: "flex", alignItems: "center", fontSize: 16, fontWeight: 700, color: "#15803D", background: "#DCFCE7" }}>20%</div>
            </div>
          </div>

          <Overline>Area multipliers</Overline>
          <div style={{ marginTop: 8 }}>
            {[
              { a: "London Z1–Z2", mult: 1.15, price: "£51.75" },
              { a: "London Z3–Z6", mult: 1.05, price: "£47.25", on: true },
              { a: "Manchester / Birmingham", mult: 1.0, price: "£45.00" },
              { a: "Other UK cities", mult: 0.95, price: "£42.75" },
              { a: "Rural & remote", mult: 1.1, price: "£49.50" },
            ].map((r, i, arr) => (
              <div key={i} style={{ padding: "10px 0", display: "flex", alignItems: "center", gap: 10, fontSize: 13, borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : 0 }}>
                <div style={{ width: 200, fontWeight: 600 }}>{r.a}</div>
                <div style={{ flex: 1, height: 6, background: "#F1F5F9", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${(r.mult - 0.8) * 250}%`, height: "100%", background: r.on ? "#2563EB" : "#94A3B8" }} />
                </div>
                <div style={{ width: 50, fontSize: 12, color: "#64748B", fontWeight: 600 }}>×{r.mult.toFixed(2)}</div>
                <div style={{ width: 70, fontSize: 14, fontWeight: 800, textAlign: "right" }}>{r.price}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, padding: 14, background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, display: "flex", gap: 10 }}>
            <Icon name="bolt" size={16} color="#B45309" />
            <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.5 }}>
              <strong>Surge pricing (beta).</strong> Auto-raise prices ×1.15 when demand is &gt;3× supply in an area. Currently <strong>off</strong>.
            </div>
          </div>
        </div>
      </Card>
    </div>
  </AdminFrame>
);

// ----------------------------------------------------------------------------
// ADMIN: ANALYTICS
// ----------------------------------------------------------------------------

const AdminAnalytics = () => (
  <AdminFrame active="analytics" crumbs={["Commercial", "Analytics"]} topRight={<div style={{ display: "flex", gap: 6 }}>{["7d", "30d", "90d", "Year"].map((p, i) => <span key={p} style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, background: i === 1 ? "#0F172A" : "#fff", color: i === 1 ? "#fff" : "#475569", border: "1px solid " + (i === 1 ? "#0F172A" : "#E2E8F0"), borderRadius: 8 }}>{p}</span>)}</div>}>
    <div style={{ marginBottom: 22 }}>
      <Overline>Last 30 days</Overline>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginTop: 4, letterSpacing: "-0.02em" }}>Marketplace performance</h1>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
      <KPI label="GMV (30d)" value="£412k" delta="+34% vs last 30d" deltaTone="success" icon="pound" />
      <KPI label="Net revenue" value="£62.6k" delta="15.2% take-rate" deltaTone="success" icon="chart" />
      <KPI label="Bookings" value="3,184" delta="+612 vs last" deltaTone="success" icon="folder" />
      <KPI label="Repeat rate" value="42%" delta="↑ 8 pts" deltaTone="success" icon="repeat" />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18, marginBottom: 18 }}>
      <Card padded={false}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>GMV trend</div>
          <Pill tone="success">+34%</Pill>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, background: "#2563EB", borderRadius: 2 }} /> This period</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, background: "#CBD5E1", borderRadius: 2 }} /> Previous</span>
          </div>
        </div>
        <div style={{ padding: 22, height: 280 }}>
          <svg width="100%" height="100%" viewBox="0 0 600 220" preserveAspectRatio="none">
            {[40, 80, 120, 160].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#F1F5F9" strokeWidth="1" />)}
            <path d="M0,140 L50,135 L100,130 L150,115 L200,120 L250,100 L300,95 L350,85 L400,90 L450,75 L500,68 L550,55 L600,52" stroke="#CBD5E1" strokeWidth="2.5" fill="none" strokeDasharray="4 4" />
            <path d="M0,160 L50,150 L100,142 L150,118 L200,128 L250,90 L300,95 L350,72 L400,80 L450,55 L500,48 L550,30 L600,18" stroke="#2563EB" strokeWidth="3" fill="none" />
            <path d="M0,160 L50,150 L100,142 L150,118 L200,128 L250,90 L300,95 L350,72 L400,80 L450,55 L500,48 L550,30 L600,18 L600,220 L0,220 Z" fill="url(#an-grad)" opacity="0.2" />
            <defs>
              <linearGradient id="an-grad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </Card>

      <Card padded={false}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #E2E8F0", fontSize: 15, fontWeight: 700 }}>Service mix</div>
        <div style={{ padding: 22 }}>
          {[
            { l: "Annual service", n: 924, p: 29, c: "#2563EB" },
            { l: "Brakes & tyres", n: 712, p: 22, c: "#3B82F6" },
            { l: "Diagnostic", n: 542, p: 17, c: "#60A5FA" },
            { l: "Battery", n: 412, p: 13, c: "#93C5FD" },
            { l: "MOT prep", n: 318, p: 10, c: "#BFDBFE" },
            { l: "Other", n: 276, p: 9, c: "#DBEAFE" },
          ].map((r, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                <span style={{ fontWeight: 600 }}>{r.l}</span>
                <span style={{ color: "#64748B" }}>{r.n} jobs · {r.p}%</span>
              </div>
              <div style={{ height: 8, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${r.p * 3.4}%`, height: "100%", background: r.c }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
      <Card>
        <Overline>Top performing areas</Overline>
        <div style={{ marginTop: 12 }}>
          {[
            { a: "Peckham SE15", g: "£28.2k", trend: "+42%" },
            { a: "Brixton SW9", g: "£24.1k", trend: "+28%" },
            { a: "Camden NW1", g: "£21.6k", trend: "+18%" },
            { a: "Hackney E8", g: "£19.4k", trend: "+22%" },
          ].map((r, i, arr) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : 0, fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{r.a}</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontWeight: 700 }}>{r.g}</span>
                <Pill tone="success" style={{ fontSize: 10 }}>{r.trend}</Pill>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Overline>Top mechanics</Overline>
        <div style={{ marginTop: 12 }}>
          {[
            { n: "James Marsden", j: 62, e: "£5.4k", r: 4.94 },
            { n: "Priya Singh", j: 58, e: "£5.1k", r: 4.92 },
            { n: "Tom Whitlock", j: 54, e: "£4.7k", r: 4.88 },
            { n: "Lucas Okoye", j: 49, e: "£4.4k", r: 4.91 },
          ].map((m, i, arr) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : 0 }}>
              <Avatar name={m.n} tint={i} size={28} />
              <div style={{ flex: 1, fontSize: 12 }}>
                <div style={{ fontWeight: 600 }}>{m.n}</div>
                <div style={{ color: "#64748B" }}>{m.j} jobs · {m.r} ★</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{m.e}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Overline>Conversion funnel</Overline>
        <div style={{ marginTop: 12 }}>
          {[
            { l: "Reg lookup started", n: 12420, p: 100 },
            { l: "Service selected", n: 8912, p: 72 },
            { l: "Price seen", n: 6240, p: 50 },
            { l: "Slot picked", n: 4108, p: 33 },
            { l: "Booked", n: 3184, p: 26 },
          ].map((r, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                <span style={{ fontWeight: 600 }}>{r.l}</span>
                <span style={{ color: "#64748B" }}>{r.n.toLocaleString()} · {r.p}%</span>
              </div>
              <div style={{ height: 10, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${r.p}%`, height: "100%", background: i === 4 ? "#22C55E" : "#2563EB" }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </AdminFrame>
);

Object.assign(window, {
  AdminFrame, AdminSidebar,
  AdminOverview, AdminJobs, AdminApprovals, AdminPricing, AdminAnalytics,
});
