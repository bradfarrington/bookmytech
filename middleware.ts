import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session if it exists — does nothing if user isn't logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminLogin = pathname === "/admin/login";
  const isMechanicArea =
    pathname === "/mechanic" || pathname.startsWith("/mechanic/");
  const isMechanicLogin = pathname === "/mechanic/login";
  const isDashboard =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isCustomerAuth = pathname === "/login" || pathname === "/signup";

  // Route a signed-in user to the area their role belongs to.
  const areaForRole = (role: string | undefined): string | null => {
    if (role === "admin") return "/admin";
    if (role === "mechanic") return "/mechanic/jobs";
    return null; // customer (or unknown) stays put
  };

  // /admin/* role gate — exempt the login page itself
  if (isAdminArea && !isAdminLogin) {
    if (!user) {
      return redirectKeepingCookies(request, response, "/admin/login");
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return redirectKeepingCookies(request, response, "/");
    }
  }

  // Already-signed-in admin landing on /admin/login → bounce to dashboard
  if (isAdminLogin && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role === "admin") {
      return redirectKeepingCookies(request, response, "/admin");
    }
  }

  // /mechanic/* gate — exempt the login page. Access = having a mechanics row
  // (RLS lets a user select their own), not role='mechanic': an admin who is
  // also a mechanic keeps role='admin' but holds a mechanics row.
  if (isMechanicArea && !isMechanicLogin) {
    if (!user) {
      return redirectKeepingCookies(request, response, "/mechanic/login");
    }
    const { data: mech } = await supabase
      .from("mechanics")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (!mech) {
      return redirectKeepingCookies(request, response, "/");
    }
  }

  // /dashboard customer gate — must be signed in; admins/mechanics get routed
  // to their own area rather than the customer dashboard.
  if (isDashboard) {
    if (!user) {
      return redirectKeepingCookies(request, response, "/login");
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const elsewhere = areaForRole(profile?.role);
    if (elsewhere) {
      return redirectKeepingCookies(request, response, elsewhere);
    }
  }

  // Already-signed-in user landing on /login or /signup → send them to where
  // they belong (their dashboard, or their admin/mechanic area).
  if (isCustomerAuth && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    return redirectKeepingCookies(
      request,
      response,
      areaForRole(profile?.role) ?? "/dashboard",
    );
  }

  // Already-signed-in mechanic landing on /mechanic/login → bounce to dashboard
  if (isMechanicLogin && user) {
    const { data: mech } = await supabase
      .from("mechanics")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (mech) {
      return redirectKeepingCookies(request, response, "/mechanic/jobs");
    }
  }

  return response;
}

function redirectKeepingCookies(
  request: NextRequest,
  baseResponse: NextResponse,
  pathname: string,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirected = NextResponse.redirect(url);
  // Forward any cookies Supabase wrote during session refresh
  for (const cookie of baseResponse.cookies.getAll()) {
    redirected.cookies.set(cookie);
  }
  return redirected;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
