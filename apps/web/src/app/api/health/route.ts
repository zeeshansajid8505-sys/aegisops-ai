import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: '@aegisops/web',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    components: {
      nextjs: {
        status: 'healthy',
        message: 'Frontend server operational',
      },
    },
  });
}
