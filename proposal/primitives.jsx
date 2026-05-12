// Book My Tech — shared primitives. Used by every screen + the deck.
// All colours from the BMT design system: Primary #2563EB, Dark #1E3A8A, Accent #3B82F6.

const Icon = ({ name, size = 18, color = "currentColor", stroke = 1.5 }) => {
  const paths = {
    search: "M21 21l-4.3-4.3M17 11a6 6 0 11-12 0 6 6 0 0112 0z",
    user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M16 7a4 4 0 11-8 0 4 4 0 018 0z",
    users: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M12 7a4 4 0 11-8 0 4 4 0 018 0z M22 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
    calendar: "M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4 M8 2v4 M3 10h18",
    clock: "M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2",
    car: "M5 17h14 M3 17V9l3-5h12l3 5v8 M3 17v3h3v-3 M21 17v3h-3v-3 M7 13a1 1 0 100-2 1 1 0 000 2z M17 13a1 1 0 100-2 1 1 0 000 2z",
    wrench: "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
    pin: "M12 22s8-7 8-13a8 8 0 00-16 0c0 6 8 13 8 13z M12 11a2 2 0 100-4 2 2 0 000 4z",
    check: "M20 6L9 17l-5-5",
    chevron: "M9 18l6-6-6-6",
    chevDown: "M6 9l6 6 6-6",
    chevUp: "M18 15l-6-6-6 6",
    chevLeft: "M15 18l-6-6 6-6",
    plus: "M12 5v14 M5 12h14",
    minus: "M5 12h14",
    x: "M18 6L6 18 M6 6l12 12",
    star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    bell: "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0",
    home: "M3 12l9-9 9 9 M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10",
    settings: "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z",
    file: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
    folder: "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z",
    inbox: "M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z",
    card: "M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2z M1 10h22",
    pound: "M18 7c0-3-2-5-5-5S8 4 8 7c0 5 0 6-3 8h12 M8 14h6 M5 21h13",
    money: "M12 1v22 M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
    bolt: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
    chart: "M3 3v18h18 M7 14l4-4 4 4 5-5",
    pie: "M21.21 15.89A10 10 0 118 2.83 M22 12A10 10 0 0012 2v10z",
    bar: "M3 3v18h18 M8 17v-7 M13 17v-4 M18 17v-10",
    arrow: "M5 12h14 M12 5l7 7-7 7",
    arrowL: "M19 12H5 M12 19l-7-7 7-7",
    arrowDn: "M12 5v14 M19 12l-7 7-7-7",
    arrowUp: "M12 19V5 M5 12l7-7 7 7",
    phone: "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z",
    mail: "M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z M22 6l-10 7L2 6",
    message: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
    map: "M1 6v16l7-3 8 3 7-3V4l-7 3-8-3z M8 3v16 M16 7v16",
    target: "M12 22a10 10 0 100-20 10 10 0 000 20z M12 18a6 6 0 100-12 6 6 0 000 12z M12 14a2 2 0 100-4 2 2 0 000 4z",
    bag: "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 11-8 0",
    zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 100-6 3 3 0 000 6z",
    edit: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
    trash: "M3 6h18 M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6 M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2 M10 11v6 M14 11v6",
    upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
    download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3",
    lock: "M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z M7 11V7a5 5 0 0110 0v4",
    key: "M21 2l-2 2 M14.5 4.5l4 4-12 12-4-4z M9 11l-3.5 3.5L9 18 M19 5l-1 1",
    flash: "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z",
    info: "M12 22a10 10 0 100-20 10 10 0 000 20z M12 16v-4 M12 8h.01",
    alert: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01",
    list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
    filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
    receipt: "M14 2H6a2 2 0 00-2 2v18l3-2 3 2 3-2 3 2 3-2 3 2V8l-6-6z M14 2v6h6 M9 12h6 M9 16h6",
    sparkle: "M12 3L9.5 8.5 4 11l5.5 2.5L12 19l2.5-5.5L20 11l-5.5-2.5z",
    gauge: "M12 14l4-4 M19 14a7 7 0 10-14 0 M21 18H3",
    repeat: "M17 1l4 4-4 4 M3 11V9a4 4 0 014-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 01-4 4H3",
    refresh: "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0114.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0020.49 15",
    play: "M5 3l14 9-14 9z",
    thumb: "M14 9V5a3 3 0 00-6 0v4H2v12h6v-9h6l4 9V9h-4z",
    badge: "M12 15a3 3 0 100-6 3 3 0 000 6z M20 7l-8-5-8 5v6c0 5 4 8 8 9 4-1 8-4 8-9V7z",
    layers: "M12 2l10 6-10 6L2 8l10-6z M2 17l10 5 10-5 M2 12.5l10 5 10-5",
    send: "M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z",
    sliders: "M4 21V14 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
    headset: "M3 18v-6a9 9 0 0118 0v6 M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3z M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z",
    truck: "M1 3h15v13H1z M16 8h4l3 3v5h-7V8z M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
    sliders2: "M21 4H14 M10 4H3 M21 12H12 M8 12H3 M21 20H16 M12 20H3 M14 2v4 M8 10v4 M16 18v4",
    activity: "M22 12h-4l-3 9L9 3l-3 9H2",
    location: "M12 22s8-7 8-13a8 8 0 00-16 0c0 6 8 13 8 13z M12 11a2 2 0 100-4 2 2 0 000 4z",
    route: "M5 19a2 2 0 11-4 0 2 2 0 014 0z M23 5a2 2 0 11-4 0 2 2 0 014 0z M3 17v-3a4 4 0 014-4h10a4 4 0 004-4V7",
    qr: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M20 14h.01 M14 20h.01 M20 20h.01 M17 17h.01",
    expand: "M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7",
  };
  const d = paths[name] || "";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: "inline-block" }}>
      {d.split(" M").map((seg, i) => <path key={i} d={(i === 0 ? "" : "M") + seg} />)}
    </svg>
  );
};

const Avatar = ({ name = "AB", size = 32, tint = 0, src }) => {
  const tints = [
    { bg: "#DBEAFE", fg: "#1E3A8A" },
    { bg: "#DCFCE7", fg: "#15803D" },
    { bg: "#FEF3C7", fg: "#B45309" },
    { bg: "#FEE2E2", fg: "#B91C1C" },
    { bg: "#E0E7FF", fg: "#3730A3" },
    { bg: "#E2E8F0", fg: "#334155" },
  ];
  const t = tints[tint % tints.length];
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("");
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  return <span style={{ width: size, height: size, borderRadius: "50%", background: t.bg, color: t.fg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: size * 0.38, flexShrink: 0, letterSpacing: 0 }}>{initials}</span>;
};

const Pill = ({ tone = "neutral", children, dot, style = {} }) => {
  const tones = {
    active:    { bg: "#DBEAFE", fg: "#1E3A8A" },
    success:   { bg: "#DCFCE7", fg: "#15803D" },
    pending:   { bg: "#FEF3C7", fg: "#B45309" },
    error:     { bg: "#FEE2E2", fg: "#B91C1C" },
    neutral:   { bg: "#F1F5F9", fg: "#334155" },
    info:      { bg: "#E0E7FF", fg: "#3730A3" },
    accent:    { bg: "#EFF6FF", fg: "#2563EB" },
    dark:      { bg: "#0F172A", fg: "#fff" },
    outline:   { bg: "#fff",    fg: "#2563EB", border: "1.5px solid #2563EB" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{ background: t.bg, color: t.fg, border: t.border || 0, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 5, letterSpacing: "0.01em", ...style }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />}
      {children}
    </span>
  );
};

const Button = ({ variant = "primary", children, icon, iconRight, size = "md", fullWidth, style = {} }) => {
  const h = size === "sm" ? 32 : size === "lg" ? 48 : 40;
  const base = {
    height: h, borderRadius: 10, padding: size === "sm" ? "0 12px" : size === "lg" ? "0 22px" : "0 16px",
    fontFamily: "inherit", fontSize: size === "sm" ? 13 : 14, fontWeight: 600,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    cursor: "pointer", border: "1px solid transparent", width: fullWidth ? "100%" : "auto", lineHeight: 1,
    transition: "all 120ms ease",
  };
  const variants = {
    primary:     { background: "#2563EB", color: "#fff" },
    secondary:   { background: "#fff", color: "#2563EB", border: "1px solid #2563EB" },
    tertiary:    { background: "transparent", color: "#2563EB" },
    ghost:       { background: "transparent", color: "#334155", border: "1px solid #E2E8F0" },
    dark:        { background: "#0F172A", color: "#fff" },
    success:     { background: "#22C55E", color: "#fff" },
    destructive: { background: "#EF4444", color: "#fff" },
  };
  return (
    <button style={{ ...base, ...variants[variant], ...style }}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 14 : 16} />}
    </button>
  );
};

const Card = ({ children, padded = true, style = {} }) => (
  <div style={{
    background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16,
    padding: padded ? 20 : 0, boxShadow: "0 4px 20px rgba(15, 23, 42, 0.04)", ...style
  }}>{children}</div>
);

const Field = ({ label, value, helper, style = {} }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{label}</div>
    <div style={{ height: 48, padding: "0 16px", display: "flex", alignItems: "center", border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff", fontSize: 14, color: "#0F172A" }}>{value}</div>
    {helper && <div style={{ fontSize: 11, color: "#64748B" }}>{helper}</div>}
  </div>
);

const Overline = ({ children, style = {} }) => (
  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "#64748B", ...style }}>{children}</div>
);

const SectionHead = ({ eyebrow, title, right, style = {} }) => (
  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16, ...style }}>
    <div>
      {eyebrow && <Overline style={{ marginBottom: 4 }}>{eyebrow}</Overline>}
      <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" }}>{title}</div>
    </div>
    {right}
  </div>
);

const KPI = ({ label, value, delta, deltaTone = "success", icon }) => {
  const deltaCol = deltaTone === "success" ? "#15803D" : deltaTone === "error" ? "#B91C1C" : "#64748B";
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>{label}</div>
        {icon && (
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={icon} size={14} color="#2563EB" />
          </div>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {delta && <div style={{ fontSize: 11, color: deltaCol, marginTop: 8, fontWeight: 600 }}>{delta}</div>}
    </Card>
  );
};

const Stars = ({ value = 5, size = 12, color = "#F59E0B" }) => (
  <span style={{ display: "inline-flex", gap: 1 }}>
    {[1, 2, 3, 4, 5].map(i => (
      <Icon key={i} name="star" size={size} color={i <= value ? color : "#E2E8F0"} stroke={1.5} />
    ))}
  </span>
);

// Step progress for booking flow
const Stepper = ({ steps = [], current = 0, style = {} }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, ...style }}>
    {steps.map((s, i) => {
      const done = i < current, active = i === current;
      return (
        <React.Fragment key={i}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              background: done || active ? "#2563EB" : "#E2E8F0",
              color: done || active ? "#fff" : "#64748B",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
            }}>
              {done ? <Icon name="check" size={11} color="#fff" /> : i + 1}
            </div>
            <span style={{ fontSize: 12, fontWeight: active ? 600 : 500, color: active ? "#0F172A" : "#64748B" }}>{s}</span>
          </div>
          {i < steps.length - 1 && <div style={{ flex: 1, height: 2, background: done ? "#2563EB" : "#E2E8F0", minWidth: 16 }} />}
        </React.Fragment>
      );
    })}
  </div>
);

// Trust badge / logo strip
const TrustBadge = ({ icon, label, value }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12 }}>
    <div style={{ width: 32, height: 32, borderRadius: 8, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={16} color="#2563EB" />
    </div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748B" }}>{label}</div>
    </div>
  </div>
);

Object.assign(window, { Icon, Avatar, Pill, Button, Card, Field, Overline, SectionHead, KPI, Stars, Stepper, TrustBadge });
