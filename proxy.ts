import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeCustomerNext, safeNext } from "@/lib/safe-next";
import { isIndexableHost } from "@/lib/site";

export async function proxy(request: NextRequest) {
  const response = await handleRequest(request);

  // Only the production domain may be indexed (see lib/site.ts). Vercel stamps
  // this header on its *.vercel.app deployment URLs itself but not on custom
  // domains, so the client-testing subdomain needs it from us. A header rather
  // than a robots.txt Disallow: a Disallow only stops crawling, and Google will
  // still list a URL it is forbidden to read if anything links to it — noindex
  // is the instruction that actually keeps a page out of results, and the bot
  // has to be allowed to fetch the page to see it.
  if (!isIndexableHost(request.headers.get("host"))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

async function handleRequest(request: NextRequest) {
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
      // Remember where they were heading. Customers arrive on deep dashboard
      // links from our own emails, and landing them on the dashboard root after
      // sign-in means they have to go and find the thing we told them about.
      return redirectKeepingCookies(
        request,
        response,
        "/login",
        safeNext(`${pathname}${request.nextUrl.search}`),
      );
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
    const elsewhere = areaForRole(profile?.role);
    // A customer following a deep link they are already signed in for never
    // reaches the login form, so honour `next` here too or the link still dies.
    // Admins and mechanics go to their own area regardless: a customer deep
    // link is not theirs to follow.
    const wanted = elsewhere
      ? null
      : safeCustomerNext(request.nextUrl.searchParams.get("next"));
    return redirectKeepingCookies(
      request,
      response,
      wanted ?? elsewhere ?? "/dashboard",
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

/**
 * Redirect without losing cookies Supabase wrote while refreshing the session.
 *
 * `target` is a relative path and may carry its own query string, as a `next`
 * value resolved by safeNext() does. `next`, when given, is added as a param so
 * the sign-in screen knows where the person was heading.
 */
function redirectKeepingCookies(
  request: NextRequest,
  baseResponse: NextResponse,
  target: string,
  next?: string | null,
): NextResponse {
  const url = request.nextUrl.clone();
  const [pathname, search] = splitTarget(target);
  url.pathname = pathname;
  // The query is REPLACED, not added to: the request's own params belong to the
  // page being blocked, not to the login screen, so forwarding them wholesale
  // would leak them into a different route. `next` is the one exception and it
  // has been through safeNext().
  //
  // Assigning the whole string rather than going via `url.searchParams.set`.
  // On a NextURL, mutating searchParams after assigning `search` does not
  // survive into the final URL — the param was silently dropped, which a
  // browser check caught and no unit test would have.
  url.search = next ? `?next=${encodeURIComponent(next)}` : search;
  const redirected = NextResponse.redirect(url);
  // Forward any cookies Supabase wrote during session refresh
  for (const cookie of baseResponse.cookies.getAll()) {
    redirected.cookies.set(cookie);
  }
  return redirected;
}

/** "/book/time?quote=x" → ["/book/time", "?quote=x"]. */
function splitTarget(target: string): [string, string] {
  const at = target.indexOf("?");
  return at === -1 ? [target, ""] : [target.slice(0, at), target.slice(at)];
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
