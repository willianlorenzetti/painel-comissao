import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/sem-acesso'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Development bypass: set DEV_USER_EMAIL in .env to skip JWT validation
  const devEmail = process.env.DEV_USER_EMAIL;
  if (devEmail) {
    const headers = new Headers(req.headers);
    headers.set('x-user-email', devEmail);
    return NextResponse.next({ request: { headers } });
  }

  const token = req.cookies.get('hub_session')?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/sem-acesso', req.url));
  }

  try {
    const secret = new TextEncoder().encode(
      process.env.SESSION_SECRET || 'dev-fallback-secret'
    );
    const { payload } = await jwtVerify(token, secret);
    const email = (payload.email as string) || (payload.sub as string);

    if (!email) throw new Error('Email ausente no token');

    const headers = new Headers(req.headers);
    headers.set('x-user-email', email);
    return NextResponse.next({ request: { headers } });
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/sem-acesso', req.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|logo\\.png).*)'],
};
