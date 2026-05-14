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
