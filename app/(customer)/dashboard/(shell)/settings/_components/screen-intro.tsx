// The big heading and sentence at the top of an Account sub-screen: the
// mockups' `.h1` ("Change your email.") under the screen header.

export function ScreenIntro({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-2xl font-extrabold leading-8 tracking-[-0.7px] text-text-primary sm:text-[26px]">
        {title}
      </h2>
      {children && <p className="mt-1.5 text-sm leading-5 text-text-secondary">{children}</p>}
    </div>
  );
}
