// Live deployed & local server E2E security smoke test (zero Gemini quota spent!)
// Usage: node tests/live-security-smoke.mjs https://vognpilot.jib01.dev

import assert from 'node:assert/strict';

const baseUrl = (process.argv[2] || 'https://vognpilot.jib01.dev').replace(/\/$/, '');

async function run() {
  console.log(`Running E2E security checks against: ${baseUrl}`);

  // 1. Verify security headers on homepage
  const homeRes = await fetch(baseUrl, { redirect: 'follow' });
  assert.equal(homeRes.status, 200, `Expected 200 from ${baseUrl}, got ${homeRes.status}`);

  const requiredHeaders = [
    'x-frame-options',
    'x-content-type-options',
    'content-security-policy',
    'referrer-policy',
    'permissions-policy',
    'strict-transport-security',
  ];
  for (const h of requiredHeaders) {
    assert.ok(homeRes.headers.get(h), `Missing security header: ${h}`);
  }
  assert.equal(homeRes.headers.get('x-frame-options')?.toUpperCase(), 'DENY');
  assert.equal(homeRes.headers.get('x-content-type-options')?.toLowerCase(), 'nosniff');
  assert.equal(homeRes.headers.get('x-powered-by'), null, 'X-Powered-By header should be hidden');
  console.log('✓ Security HTTP headers verified');

  // 2. Verify all 4 public sample shelf images load cleanly
  for (const sample of ['sample-dairy.jpg', 'sample-bananas.jpg', 'sample-juice.jpg', 'sample-butter.jpg']) {
    const sRes = await fetch(`${baseUrl}/samples/${sample}`);
    assert.equal(sRes.status, 200, `Expected 200 for /samples/${sample}, got ${sRes.status}`);
  }
  console.log('✓ Public sample shelves verified');

  // 3. Verify quota status endpoint reports active backend & policy cleanly
  const qRes = await fetch(`${baseUrl}/api/v1/quota`);
  assert.equal(qRes.status, 200, `Expected 200 from /api/v1/quota, got ${qRes.status}`);
  const qJson = await qRes.json();
  assert.ok(qJson.quotas?.scan?.day?.limit > 0);
  console.log(`✓ Quota inspection verified (backend=${qJson.quotaBackend}, dbConfigured=${qJson.dbConfigured})`);

  // 4. Verify POST /api/v1/scan blocks spoofed HTML disguised as JPEG (0 Gemini tokens)
  const spoofedB64 = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
  const spoofRes = await fetch(`${baseUrl}/api/v1/scan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: spoofedB64, mimeType: 'image/jpeg' }),
  });
  assert.equal(spoofRes.status, 400, `Expected 400 for spoofed image, got ${spoofRes.status}`);
  console.log('✓ Spoofed image signature rejection (400) verified');

  // 5. Verify SVG MIME is rejected (400)
  const svgRes = await fetch(`${baseUrl}/api/v1/scan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: Buffer.from('<svg></svg>').toString('base64'), mimeType: 'image/svg+xml' }),
  });
  assert.equal(svgRes.status, 400, `Expected 400 for SVG MIME, got ${svgRes.status}`);
  console.log('✓ SVG MIME rejection (400) verified');

  // 6. Verify cross-origin POST is blocked (403) on /scan & /ask
  for (const ep of ['/api/v1/scan', '/api/v1/ask']) {
    const crossRes = await fetch(`${baseUrl}${ep}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil-attacker.example',
      },
      body: JSON.stringify({ question: 'test', image: spoofedB64, mimeType: 'image/jpeg' }),
    });
    assert.equal(crossRes.status, 403, `Expected 403 for cross-origin ${ep}, got ${crossRes.status}`);
  }
  console.log('✓ Cross-origin protection (403) on /scan & /ask verified');

  // 7. Verify oversized payload (> 3MB) is rejected with 413
  const hugeRes = await fetch(`${baseUrl}/api/v1/scan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: 'A'.repeat(4_300_000), mimeType: 'image/jpeg' }),
  });
  assert.equal(hugeRes.status, 413, `Expected 413 for oversized payload, got ${hugeRes.status}`);
  console.log('✓ Oversized payload limit (413) verified');

  // 8. Verify unsupported Content-Type (415) and empty question (400)
  const ctRes = await fetch(`${baseUrl}/api/v1/scan`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'hello',
  });
  assert.equal(ctRes.status, 415, `Expected 415 for text/plain, got ${ctRes.status}`);

  const emptyAskRes = await fetch(`${baseUrl}/api/v1/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: '   \n  ' }),
  });
  assert.equal(emptyAskRes.status, 400, `Expected 400 for empty /ask question, got ${emptyAskRes.status}`);
  console.log('✓ Content-type (415) and empty question (400) checks verified');

  console.log('ALL E2E SECURITY CHECKS PASSED.');
}

run().catch((err) => {
  console.error('SECURITY CHECK FAILED:', err);
  process.exit(1);
});
