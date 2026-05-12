// Book My Tech — interactive proposal deck.
// Pattern follows the GamLEARN deck: each slide is a Wrap; key slides
// embed a tabbed carousel (CarouselSlide) so the prospect can flick through screens.

const PhoneMock = ({ children, lg }) => {
  const w = lg ? 280 : 240;
  const scale = (w - 16) / 375;
  const h = 760 * scale;
  return (
    <div className={`phone-mock${lg ? ' phone-mock--lg' : ''}`}>
      <div className="phone-mock__status">
        <span>9:41</span>
        <div className="phone-mock__notch" />
        <span style={{ fontSize: 10 }}>●●●●</span>
      </div>
      <div className="phone-mock__screen" style={{ height: h }}>
        <div className="phone-mock__inner" style={{ transform: `scale(${scale})`, height: 760 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

const DesktopMock = ({ children }) => {
  const [scale, setScale] = React.useState(0.5);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const update = () => setScale(el.offsetWidth / 1280);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="desktop-mock" style={{ height: 28 + 800 * scale }}>
      <div className="desktop-mock__inner" style={{ transform: `scale(${scale})` }}>{children}</div>
    </div>
  );
};

const SlideFooter = ({ num, label }) => (
  <div className="slide__footer"><span>{num} · {label} · BOOK MY TECH</span></div>
);

// Carousel slide — left text + tab buttons, right tabbed screen swap.
const CarouselSlide = ({ title, eyebrow, num, footerLabel, callouts, screenData, theme }) => {
  const [screen, setScreen] = React.useState(0);

  const Tabs = () => (
    <div className="screen-tabs">
      {screenData.map((s, i) => (
        <button key={i} className={`screen-tab ${i === screen ? 'screen-tab--active' : ''}`} onClick={() => setScreen(i)}>
          {s.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`slide ${theme || ''}`}>
      <div className="mobile-only-tabs" style={{ position: 'absolute', top: 24, left: 0, width: '100%', zIndex: 50, justifyContent: 'center' }}>
        <Tabs />
      </div>
      <div className="slide__left" style={{ flex: '0 0 38%', paddingRight: 32 }}>
        <div className="deck-overline enter e-up">{eyebrow}</div>
        <h2 className="deck-h2 enter e-up d1" dangerouslySetInnerHTML={{ __html: title }} style={{ marginBottom: 24 }} />
        <div className="enter e-up d2">
          {callouts.map(([cls, t, d], i) => (
            <div key={i} className={`callout ${cls}`} style={{ marginBottom: 14 }}>
              <div className="callout__title">{t}</div>
              <div className="callout__body">{d}</div>
            </div>
          ))}
        </div>
        <div className="enter e-up d3 desktop-only-tabs" style={{ marginTop: 24 }}>
          <Tabs />
        </div>
      </div>
      <div className="slide__right enter e-scale d2" style={{ flex: 1, position: 'relative' }}>
        <div className="crm-mock-wrapper" data-screen-idx={screen} style={{ width: '100%', maxWidth: 1100, position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}>
          <DesktopMock>
            <div key={screen} className="screen-fade" style={{ width: '100%', height: '100%' }}>
              {screenData[screen].el}
            </div>
          </DesktopMock>
        </div>
      </div>
      <SlideFooter num={num} label={footerLabel} />
    </div>
  );
};

// Mobile carousel slide — phones instead of desktop mocks
const PhoneCarouselSlide = ({ title, eyebrow, num, footerLabel, callouts, screenData, theme }) => {
  const [screen, setScreen] = React.useState(0);

  const Tabs = () => (
    <div className="screen-tabs">
      {screenData.map((s, i) => (
        <button key={i} className={`screen-tab ${i === screen ? 'screen-tab--active' : ''}`} onClick={() => setScreen(i)}>
          {s.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`slide ${theme || ''}`}>
      <div className="mobile-only-tabs" style={{ position: 'absolute', top: 24, left: 0, width: '100%', zIndex: 50, justifyContent: 'center' }}>
        <Tabs />
      </div>
      <div className="slide__left" style={{ flex: '0 0 42%', paddingRight: 32 }}>
        <div className="deck-overline enter e-up">{eyebrow}</div>
        <h2 className="deck-h2 enter e-up d1" dangerouslySetInnerHTML={{ __html: title }} style={{ marginBottom: 24 }} />
        <div className="enter e-up d2">
          {callouts.map(([cls, t, d], i) => (
            <div key={i} className={`callout ${cls}`} style={{ marginBottom: 14 }}>
              <div className="callout__title">{t}</div>
              <div className="callout__body">{d}</div>
            </div>
          ))}
        </div>
        <div className="enter e-up d3 desktop-only-tabs" style={{ marginTop: 24 }}>
          <Tabs />
        </div>
      </div>
      <div className="slide__right enter e-scale d2" style={{ flex: 1, position: 'relative', justifyContent: 'center' }}>
        <div key={screen} className="screen-fade">
          <PhoneMock lg>
            {screenData[screen].el}
          </PhoneMock>
        </div>
      </div>
      <SlideFooter num={num} label={footerLabel} />
    </div>
  );
};

// ---- MAIN APP ----
const ProposalApp = () => {
  const [current, setCurrent] = React.useState(0);
  const [mobileStep, setMobileStep] = React.useState(0);
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 768);
  const totalSlides = 11;

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const next = () => {
    const isSingleStep = current === 9;
    if (isMobile && mobileStep === 0 && !isSingleStep) setMobileStep(1);
    else if (current < totalSlides - 1) { setCurrent(current + 1); setMobileStep(0); }
  };
  const prev = () => {
    const prevIsSingleStep = (current - 1) === 9;
    if (isMobile && mobileStep === 1) setMobileStep(0);
    else if (current > 0) { setCurrent(current - 1); setMobileStep(isMobile && !prevIsSingleStep ? 1 : 0); }
  };
  const go = (n) => { setCurrent(Math.max(0, Math.min(totalSlides - 1, n))); setMobileStep(0); };

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')  { e.preventDefault(); prev(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current, isMobile, mobileStep]);

  React.useEffect(() => {
    const deck = document.querySelector('.deck');
    if (!deck) return;
    deck.querySelectorAll('.slide-wrap').forEach((w, i) => {
      if (i === current) {
        w.querySelectorAll('.enter').forEach(el => el.classList.remove('on'));
        requestAnimationFrame(() => requestAnimationFrame(() => {
          w.querySelectorAll('.enter').forEach(el => el.classList.add('on'));
        }));
      }
    });
  }, [current, mobileStep]);

  const Wrap = ({ idx, children }) => (
    <div className={`slide-wrap ${idx === current ? ('active ' + (mobileStep === 0 ? 'step-text' : 'step-image')) : ''}`}
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: idx === current ? 1 : 0,
        pointerEvents: idx === current ? 'auto' : 'none',
        zIndex: idx === current ? 10 : 1,
        transition: 'opacity 0.6s ease',
      }}>{children}</div>
  );

  const Logo = ({ size = 160, dark }) => (
    <img src="assets/logo-no-bg.png" alt="Book My Tech" style={{ height: size, maxWidth: '100%', display: 'block', filter: dark ? 'brightness(0) invert(1)' : 'none' }} />
  );

  return (
    <React.Fragment>
      <div className="deck">

        {/* 0 — COVER */}
        <Wrap idx={0}>
          <div className="slide slide--gradient">
            <div className="slide__left" style={{ flex: '0 0 50%', paddingRight: 40 }}>
              <div className="enter e-fade" style={{ marginBottom: 56 }}><Logo size={140} /></div>
              <div className="deck-overline enter e-up d1">Product Proposal · April 2026</div>
              <h1 className="deck-h1 enter e-up d2" style={{ marginBottom: 18 }}>The mobile mechanic marketplace, reimagined.</h1>
              <p className="deck-body enter e-up d3" style={{ maxWidth: 600, marginBottom: 32 }}>
                A two-sided platform that turns every car repair into a 60-second booking.
                Vetted mechanics, transparent pricing, and a back office that runs the whole network on autopilot.
              </p>
              <div className="stat-row enter e-up d4" style={{ maxWidth: 640, marginTop: 12 }}>
                <div className="stat-box"><div className="stat-box__value">7</div><div className="stat-box__label">Customer screens</div></div>
                <div className="stat-box"><div className="stat-box__value">6</div><div className="stat-box__label">Mechanic screens</div></div>
                <div className="stat-box"><div className="stat-box__value">5</div><div className="stat-box__label">Admin screens</div></div>
                <div className="stat-box"><div className="stat-box__value">1</div><div className="stat-box__label">Unified platform</div></div>
              </div>
            </div>
            <div className="slide__right enter e-scale d2" style={{ flex: 1, position: 'relative' }}>
              <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 1, width: '100%', maxWidth: 1000 }}>
                <DesktopMock><AdminOverview /></DesktopMock>
              </div>
              <div style={{ position: 'absolute', right: -40, top: '52%', transform: 'translateY(-30%)', zIndex: 2 }}>
                <PhoneMock lg><CustomerDashboard /></PhoneMock>
              </div>
            </div>
            <SlideFooter num="00" label="COVER" />
          </div>
        </Wrap>

        {/* 1 — THE PROBLEM */}
        <Wrap idx={1}>
          <div className="slide slide--dark">
            <div className="slide__left" style={{ flex: '0 0 46%', paddingRight: 40, position: 'relative', zIndex: 10 }}>
              <div className="deck-overline enter e-up">The Problem</div>
              <h2 className="deck-h2 enter e-up d1" style={{ marginBottom: 20 }}>Car repair is stuck in 2005.</h2>
              <p className="deck-body enter e-up d2" style={{ marginBottom: 28, color: 'rgba(255,255,255,0.78)' }}>
                Customers waste hours phoning garages for quotes that never line up.
                Mechanics waste fuel chasing leads that don't convert. Operators run the whole thing on spreadsheets.
              </p>
              <div className="enter e-up d3 callout-grid">
                {[
                  ['callout--red', 'Opaque pricing', '70% of customers abandon a quote because they can\'t see the total before booking.'],
                  ['callout--amber', 'Slow matching', 'Phone-and-quote loops mean the average booking takes 3+ days to confirm.'],
                  ['callout--red', 'Mechanic downtime', 'Independent mechanics burn 30%+ of their week on admin and dead leads.'],
                  ['callout', 'No live oversight', 'Operators only see jobs after the fact. No demand map. No bottleneck visibility.'],
                ].map(([cls, t, d], i) => (
                  <div key={i} className={`callout ${cls}`} style={{ marginTop: 0 }}>
                    <div className="callout__title">{t}</div>
                    <div className="callout__body">{d}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="slide__right enter e-fade d3" style={{ flex: 1, position: 'relative' }}>
              <div style={{ position: 'absolute', right: -40, top: '40%', transform: 'translateY(-50%) rotate(-2deg)', zIndex: 1, width: '100%', maxWidth: 900, opacity: 0.85 }}>
                <DesktopMock><AdminJobs /></DesktopMock>
              </div>
              <div style={{ position: 'absolute', right: -120, top: '70%', transform: 'translateY(-50%) rotate(3deg)', zIndex: 0, width: '100%', maxWidth: 900, opacity: 0.4 }}>
                <DesktopMock><MechJobsDashboard /></DesktopMock>
              </div>
            </div>
            <SlideFooter num="01" label="THE PROBLEM" />
          </div>
        </Wrap>

        {/* 2 — THE TRANSFORMATION */}
        <Wrap idx={2}>
          <div className="slide slide--blue">
            <div className="slide__left" style={{ flex: '0 0 48%', paddingRight: 40, zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="deck-overline enter e-up">The Transformation</div>
              <h2 className="deck-h2 enter e-up d1" style={{ marginBottom: 18 }}>
                From three days<br />to sixty seconds.
              </h2>
              <p className="deck-body enter e-up d2" style={{ marginBottom: 36, color: 'rgba(255,255,255,0.85)' }}>
                One platform. Three perfectly tuned interfaces. Customers book in under a minute,
                mechanics fill their day with the right jobs, and you watch a self-running marketplace
                grow from a single dashboard.
              </p>
              <div className="stat-row enter e-up d3" style={{ width: '100%' }}>
                <div className="stat-box"><div className="stat-box__value">60s</div><div className="stat-box__label">From reg to booked</div></div>
                <div className="stat-box"><div className="stat-box__value">3.4×</div><div className="stat-box__label">Mechanic utilisation</div></div>
                <div className="stat-box"><div className="stat-box__value">42%</div><div className="stat-box__label">Repeat-customer rate</div></div>
                <div className="stat-box"><div className="stat-box__value">15%</div><div className="stat-box__label">Take-rate target</div></div>
              </div>
            </div>
            <div className="slide__right enter e-scale d2" style={{ flex: 1, position: 'relative' }}>
              <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 1, width: '100%', maxWidth: 1000 }}>
                <DesktopMock><AdminAnalytics /></DesktopMock>
              </div>
              <div style={{ position: 'absolute', right: -40, top: '52%', transform: 'translateY(-30%)', zIndex: 2 }}>
                <PhoneMock lg><BookingConfirmation /></PhoneMock>
              </div>
            </div>
            <SlideFooter num="02" label="THE TRANSFORMATION" />
          </div>
        </Wrap>

        {/* 3 — CUSTOMER HOMEPAGE */}
        <Wrap idx={3}>
          <div className="slide">
            <div className="slide__left" style={{ flex: '0 0 36%', paddingRight: 32 }}>
              <div className="deck-overline enter e-up">Customer · Web</div>
              <h2 className="deck-h2 enter e-up d1" style={{ marginBottom: 22 }}>The first impression that closes leads.</h2>
              <div className="enter e-up d2">
                <div className="callout">
                  <div className="callout__title">Reg-plate lookup, not a form</div>
                  <div className="callout__body">Customers type their reg, we pull DVLA make / model / fuel / MOT — friction collapses, conversion climbs.</div>
                </div>
                <div className="callout callout--green">
                  <div className="callout__title">Trust signals everywhere</div>
                  <div className="callout__body">DBS-checked badge, 4.9★ aggregate rating, 12-month guarantee — visible before the user has even scrolled.</div>
                </div>
                <div className="callout">
                  <div className="callout__title">Live mechanic preview</div>
                  <div className="callout__body">A "best match" panel shows real mechanics with prices the moment a postcode is typed — no quote-and-wait dead zone.</div>
                </div>
              </div>
            </div>
            <div className="slide__right enter e-scale d2" style={{ flex: 1, position: 'relative' }}>
              <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: '100%', maxWidth: 1100 }}>
                <DesktopMock><CustomerHomepage /></DesktopMock>
              </div>
            </div>
            <SlideFooter num="03" label="CUSTOMER · HOMEPAGE" />
          </div>
        </Wrap>

        {/* 4 — BOOKING FLOW */}
        <Wrap idx={4}>
          <PhoneCarouselSlide num="04" footerLabel="CUSTOMER · BOOKING FLOW" eyebrow="Customer · Mobile"
            title="A booking flow that<br/>refuses to lose people."
            callouts={[
              ['', 'One decision per screen', 'Each step asks one thing — vehicle, issue, price, time. Cognitive load stays low, completion stays high.'],
              ['callout--green', 'Transparent fixed price', 'Total is visible by step 3. No call-out fees, no surprises at handover. Pre-auth, charge on completion.'],
            ]}
            screenData={[
              { label: '1. Vehicle', el: <BookingStep1 /> },
              { label: '2. Issue', el: <BookingStep2 /> },
              { label: '3. Price', el: <BookingStep3 /> },
              { label: '4. Time slot', el: <BookingStep4 /> },
            ]} />
        </Wrap>

        {/* 5 — POST-BOOKING (confirmation, dashboard, review) */}
        <Wrap idx={5}>
          <PhoneCarouselSlide num="05" footerLabel="CUSTOMER · POST-BOOKING" eyebrow="Customer · Mobile"
            title="The bit that turns<br/>a buyer into a regular."
            callouts={[
              ['callout--green', 'Live job tracking', 'A mechanic ETA, a map, a chat thread. Customers stop calling support — your CSAT and NPS climb.'],
              ['', 'Effortless re-booking', 'Past jobs become one-tap repeat orders. Repeat rate ≥ 42% becomes the default, not the goal.'],
              ['callout--amber', 'Reviews that compound', 'Five-star ratings flow back into the homepage trust signals. Every job markets the next one.'],
            ]}
            screenData={[
              { label: 'Confirmation', el: <BookingConfirmation /> },
              { label: 'My bookings', el: <CustomerDashboard /> },
              { label: 'Leave a review', el: <ReviewScreen /> },
            ]} />
        </Wrap>

        {/* 6 — MECHANIC WEB DASHBOARD */}
        <Wrap idx={6}>
          <CarouselSlide num="06" footerLabel="MECHANIC · WEB APP" eyebrow="Mechanic Network"
            title="Mechanics fill<br/>their day, not their inbox."
            callouts={[
              ['', 'A pipeline, not a phone', 'Live offers within radius, accept in one tap, route-optimised schedule. No quoting, no chasing.'],
              ['callout--green', 'Earnings, visible & instant', 'Live take-home per job. Weekly earnings trend. Pro-tier incentive that compounds loyalty.'],
              ['callout--amber', 'Self-service controls', 'Mechanics tune their own radius, hours and specialisms. You get a self-staffing network.'],
            ]}
            screenData={[
              { label: 'Live jobs', el: <MechJobsDashboard /> },
              { label: 'Job detail', el: <MechJobDetail /> },
              { label: 'Earnings', el: <MechEarnings /> },
              { label: 'Availability', el: <MechAvailability /> },
            ]} />
        </Wrap>

        {/* 7 — MECHANIC MOBILE APP */}
        <Wrap idx={7}>
          <PhoneCarouselSlide num="07" footerLabel="MECHANIC · MOBILE" eyebrow="Mechanic on the road"
            title="A field tool that<br/>respects their hands."
            callouts={[
              ['callout--green', 'One-tap accept', 'Push notification → full job summary → accept. From offer to confirmed in under five seconds.'],
              ['', 'Work-step checklist', 'Guided progress steps make handover, customer comms and proof-of-work effortless. Auto-charges on sign-off.'],
              ['callout--amber', 'Daily goal & rhythm', 'Earnings goal ring keeps mechanics motivated through quieter mornings — a UX nudge, not a sales line.'],
            ]}
            screenData={[
              { label: 'Day view', el: <MechMobileDay /> },
              { label: 'Job offer', el: <MechMobileOffer /> },
              { label: 'In progress', el: <MechMobileInProgress /> },
            ]} />
        </Wrap>

        {/* 8 — ADMIN CONSOLE */}
        <Wrap idx={8}>
          <CarouselSlide num="08" footerLabel="ADMIN · OPERATIONS CONSOLE" eyebrow="Operator"
            title="Run a national<br/>marketplace from one tab."
            theme="slide--white"
            callouts={[
              ['', 'Live operations monitor', 'Every booking, every mechanic, every penny — in real time. Spot supply gaps before customers hit them.'],
              ['callout--green', 'Self-staffing network', 'Mechanic onboarding, vetting, and document review on rails. Approve in two clicks, not two weeks.'],
              ['callout--amber', 'Pricing as a lever', 'Tune service rates and area multipliers without an engineer. Switch surge on the second demand spikes.'],
            ]}
            screenData={[
              { label: 'Overview', el: <AdminOverview /> },
              { label: 'All jobs', el: <AdminJobs /> },
              { label: 'Approvals', el: <AdminApprovals /> },
              { label: 'Pricing', el: <AdminPricing /> },
              { label: 'Analytics', el: <AdminAnalytics /> },
            ]} />
        </Wrap>

        {/* 9 — BUSINESS MODEL */}
        <Wrap idx={9}>
          <div className="slide slide--dark">
            <div className="slide__center" style={{ flex: 1, maxWidth: 1100, margin: '0 auto', textAlign: 'left' }}>
              <div className="deck-overline enter e-up" style={{ textAlign: 'center', alignSelf: 'center' }}>The Business Model</div>
              <h2 className="deck-h2 enter e-up d1" style={{ marginBottom: 18, textAlign: 'center', maxWidth: 900 }}>A marketplace built to compound, not just convert.</h2>
              <p className="deck-body enter e-up d2" style={{ marginBottom: 40, textAlign: 'center', maxWidth: 720, color: 'rgba(255,255,255,0.78)' }}>
                Each job earns commission today, every repeat lifts retention tomorrow,
                and every new lever — surge, featured, parts margin — slots straight into the architecture you'll see launch on day one.
              </p>
              <div className="enter e-up d3 business-model-grid">
                {[
                  { icon: 'pound', t: 'Commission per job', d: 'Default 15% take-rate. Lower for Pro mechanics — a built-in loyalty driver.', big: '15%', cap: 'Per booking' },
                  { icon: 'map', t: 'Area-based pricing', d: 'Margins protected in expensive postcodes. Coverage subsidised in growing ones.', big: '×1.05–1.15', cap: 'Multiplier range' },
                  { icon: 'bolt', t: 'Surge & featured', d: 'Surge auto-engages when demand outstrips supply. Featured listings sold to top mechanics.', big: '+8%', cap: 'Forecast revenue lift' },
                ].map((p, i) => (
                  <div key={i} className="feature-card business-card">
                    <div className="feature-card__icon business-card__icon">
                      <Icon name={p.icon} size={20} color="#93C5FD" />
                    </div>
                    <div className="business-card__stats">
                      <div className="business-card__big">{p.big}</div>
                      <div className="business-card__cap">{p.cap}</div>
                    </div>
                    <div className="business-card__main">
                      <div className="business-card__title">{p.t}</div>
                      <div className="business-card__desc">{p.d}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="enter e-up d4 future-proof-box">
                <div className="future-proof-icon">
                  <Icon name="sparkle" size={20} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="future-proof-title">Future-proofed by design.</div>
                  <div className="future-proof-desc">Parts margin, fleet contracts, insurance partnerships — every monetisation lever is wired into the data model from day one.</div>
                </div>
              </div>
            </div>
            <SlideFooter num="09" label="BUSINESS MODEL" />
          </div>
        </Wrap>

        {/* 10 — CTA / NEXT STEPS */}
        <Wrap idx={10}>
          <div className="slide slide--gradient">
            <div className="slide__left" style={{ flex: '0 0 50%', paddingRight: 60, position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="enter e-fade" style={{ marginBottom: 36 }}><Logo size={120} /></div>
              <div className="deck-overline enter e-up d1">Next Steps</div>
              <h2 className="deck-h2 enter e-up d2" style={{ marginBottom: 18 }}>Your platform is designed.<br />Now let's launch it.</h2>
              <p className="deck-body enter e-up d3" style={{ marginBottom: 32 }}>
                Every screen on the previous slides is locked, on-brand, and engineered to ship.
                The customer flow, mechanic network and ops console are wired into the same data model — so growth doesn't need a rebuild.
              </p>
              <div className="feature-grid enter e-up d4">
                {[
                  ['zap', 'Phase 1', 'Customer booking flow + mechanic web app + ops console MVP. London first.'],
                  ['users', 'Phase 2', 'Mechanic mobile app, automated payouts, smart dispatch.'],
                  ['chart', 'Phase 3', 'Surge pricing, featured listings, parts margin layer.'],
                  ['target', 'Launch ready', 'Pilot in 3 London boroughs, scale to UK in months 4–6.'],
                ].map(([icon, t, d], i) => (
                  <div key={i} className="feature-card">
                    <div className="feature-card__icon"><Icon name={icon} size={18} color="#2563EB" /></div>
                    <div className="feature-card__title">{t}</div>
                    <div className="feature-card__desc">{d}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="slide__right enter e-scale d3" style={{ flex: 1, position: 'relative' }}>
              <div style={{ position: 'absolute', right: 100, top: '38%', transform: 'translateY(-50%) rotate(-3deg)', zIndex: 1, width: '100%', maxWidth: 900, opacity: 0.7 }}>
                <DesktopMock><CustomerHomepage /></DesktopMock>
              </div>
              <div style={{ position: 'absolute', right: 0, top: '54%', transform: 'translateY(-50%) rotate(2deg)', zIndex: 2, width: '100%', maxWidth: 900 }}>
                <DesktopMock><MechJobsDashboard /></DesktopMock>
              </div>
              <div style={{ position: 'absolute', right: -50, top: '70%', transform: 'translateY(-30%) rotate(6deg)', zIndex: 3 }}>
                <PhoneMock lg><CustomerDashboard /></PhoneMock>
              </div>
            </div>
            <SlideFooter num="10" label="LET'S BUILD IT" />
          </div>
        </Wrap>

      </div>

      <div className="deck-nav">
        <button className="deck-nav__btn" disabled={current === 0 && (!isMobile || mobileStep === 0)} onClick={prev}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 3L5 7l4 4" /></svg>
        </button>
        <div className="deck-nav__dots">
          {Array.from({ length: totalSlides }, (_, i) => (
            <button key={i} className={`deck-nav__dot ${i === current ? 'deck-nav__dot--active' : ''}`} onClick={() => go(i)} />
          ))}
        </div>
        <button className="deck-nav__btn" disabled={current === totalSlides - 1 && (!isMobile || mobileStep === 1)} onClick={next}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 3l4 4-4 4" /></svg>
        </button>
      </div>
    </React.Fragment>
  );
};

Object.assign(window, { ProposalApp });
