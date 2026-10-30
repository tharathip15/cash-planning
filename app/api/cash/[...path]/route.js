import { proxyCash } from '../../../../server/cash-proxy.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request) { return proxyCash(request); }
export async function PUT(request) { return proxyCash(request); }
