const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { encryptAes256Cbc, decryptAes256Cbc } = require('../api/odoo/_crypto');
const { normalizeProfile, callUpstreamLogin, callUpstreamMe } = require('../api/odoo/_service');
const loginHandler = require('../api/odoo/login');
const verifyOtpHandler = require('../api/odoo/verify-otp');
const meHandler = require('../api/odoo/me');
const logoutHandler = require('../api/odoo/logout');
const { DEFAULT_SESSION_AGE_SECONDS } = require('../api/odoo/_config');
const { getEncryptedCookie } = require('../api/odoo/_cookies');
const { handleRequest } = require('../jira-server');

const TEST_SECRET = '12345678901234567890123456789012';
const TEST_BASE_URL = 'https://odoo.example.com';

function makeResponse(status, body, ok) {
  return {
    ok: typeof ok === 'boolean' ? ok : status >= 200 && status < 300,
    status,
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    }
  };
}

function createMockRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    body: '',
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.headers['Content-Type'] = 'application/json; charset=utf-8';
      this.body = JSON.stringify(payload);
      return this;
    },
    send(payload) {
      this.body = typeof payload === 'string' ? payload : String(payload);
      return this;
    },
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      if (headers && typeof headers === 'object') {
        Object.assign(this.headers, headers);
      }
      return this;
    },
    end(payload) {
      if (payload !== undefined) {
        this.body = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload);
      }
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    getHeader(name) {
      return this.headers[name];
    }
  };
}

function createMockReq(body, cookieHeader) {
  return {
    body,
    headers: cookieHeader ? { cookie: cookieHeader } : {}
  };
}

function setOdooEnv() {
  process.env.ODOO_API_BASE = TEST_BASE_URL;
  process.env.ODOO_AUTH_SECRET = TEST_SECRET;
}

function clearOdooEnv() {
  delete process.env.ODOO_API_BASE;
  delete process.env.ODOO_AUTH_SECRET;
}

function makeEnvelope(data) {
  return encryptAes256Cbc(JSON.stringify({
    error: false,
    status: 200,
    data: JSON.stringify(data)
  }), TEST_SECRET, Buffer.alloc(16, 3));
}

function makeResultEnvelope(result) {
  return encryptAes256Cbc(JSON.stringify({
    result
  }), TEST_SECRET, Buffer.alloc(16, 3));
}

async function withMockFetch(queue, fn, captureRequests) {
  const originalFetch = global.fetch;
  global.fetch = async (...args) => {
    if (Array.isArray(captureRequests)) {
      captureRequests.push(args);
    }
    if (queue.length === 0) {
      throw new Error('Unexpected fetch call');
    }
    return queue.shift();
  };

  try {
    await fn();
  } finally {
    global.fetch = originalFetch;
  }
}

test('AES helper round-trips the encrypted payload format', () => {
  const plaintext = JSON.stringify({ error: false, status: 200, data: '{"token":"abc"}' });
  const encrypted = encryptAes256Cbc(plaintext, TEST_SECRET, Buffer.alloc(16, 9));
  assert.equal(decryptAes256Cbc(encrypted, TEST_SECRET), plaintext);
});

test('AES helper accepts the 16-byte ODOO secret from env and still round-trips', () => {
  const secret = 'ODOO@ETC_DEV2023';
  const plaintext = JSON.stringify({ ok: true });
  const encrypted = encryptAes256Cbc(plaintext, secret, Buffer.alloc(16, 4));
  assert.equal(decryptAes256Cbc(encrypted, secret), plaintext);
});

test('normalizeProfile maps upstream profile fields into a stable shape', () => {
  const profile = normalizeProfile({
    id: 10,
    user_id: 20,
    name: 'Nguyen Van A',
    login: 'nguyenvana',
    display_name: 'Nguyen Van A',
    email: 'user@example.com',
    address: '123 Street',
    mobile_phone: '0900',
    job_title: 'Developer',
    company_id: 1,
    company_name: 'ETC',
    avatar_1024: 'base64-image',
    is_manager: true,
    department: {
      id: 2,
      name: 'IT',
      level: 3,
      manager: { id: 7, name: 'Manager', account: 'mgr', email: 'mgr@example.com' }
    },
    total_leave_request: 0.5,
    total_over_time: 2,
    check_in: '08:00:00',
    check_out: '17:30:00',
    total_late_day: 1,
    current_residence: 'HCM',
    can_week: false,
    biometry: true,
    biometry_type: 'fingerprint',
    violation: false,
    inform_auto_payment_lunch: {
      epay_wallet_account: 'wallet',
      status_auto_payment: true,
      activation_date: '2026-01-01'
    },
    manager: { level: 4 },
    approve_asset_request: { enabled: true },
    approve_ot_request: {
      manager: { id: 9, name: 'OT Manager', account: 'otmgr', email: 'ot@example.com' }
    },
    approve_leave_request: { enabled: false },
    etc_form_management: { enabled: true },
    it_confirm: true,
    e_work_day: ['2026-01-01']
  });

  assert.equal(profile.name, 'Nguyen Van A');
  assert.equal(profile.company.name, 'ETC');
  assert.equal(profile.department.manager.email, 'mgr@example.com');
  assert.equal(profile.stats.totalOverTime, 2);
  assert.equal(profile.flags.itConfirm, true);
});

test('callUpstreamLogin and callUpstreamMe decode upstream encrypted envelopes', async () => {
  setOdooEnv();
  const tokenPayload = { id: 12, token: 'encrypted-token' };
  const profilePayload = {
    id: 12,
    user_id: 45,
    name: 'Test User',
    login: 'test',
    display_name: 'Test User',
    email: 'test@example.com',
    company_id: 1,
    company_name: 'Company',
    department: { id: 1, name: 'IT', level: 1, manager: {} },
    manager: { level: 2 }
  };

  await withMockFetch([
    makeResponse(200, makeEnvelope(tokenPayload)),
    makeResponse(200, makeEnvelope(profilePayload))
  ], async () => {
    const config = { apiBase: TEST_BASE_URL, authSecret: TEST_SECRET };
    const loginResult = await callUpstreamLogin(config, {
      account: 'test@example.com',
      password: 'secret',
      device_id: 'device-1',
      platform_type: 'android'
    });
    assert.equal(loginResult.token, 'encrypted-token');

    const meResult = await callUpstreamMe(config, loginResult.token);
    assert.equal(meResult.normalizedProfile.email, 'test@example.com');
  });
});

test('callUpstreamLogin sends the encrypted login payload as a raw form body', async () => {
  setOdooEnv();
  const requests = [];

  await withMockFetch([
    makeResponse(200, makeEnvelope({ id: 12, token: 'encrypted-token' }))
  ], async () => {
    const config = { apiBase: TEST_BASE_URL, authSecret: TEST_SECRET };
    await callUpstreamLogin(config, {
      account: 'test@example.com',
      password: 'secret',
      device_id: 'device-1',
      platform_type: 'android'
    });
  }, requests);

  assert.equal(requests.length, 1);
  const [url, options] = requests[0];
  assert.equal(url, `${TEST_BASE_URL}/api/v1/login`);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['Content-Type'], '*');
  assert.ok(typeof options.body === 'string');
  assert.doesNotMatch(options.body, /account|password|device_id|platform_type/);
});

test('POST /api/odoo/login stores the temporary Business token in a pending cookie and asks for OTP', async () => {
  setOdooEnv();
  const loginPayload = { id: 7, token: 'upstream-token' };
  const res = createMockRes();

  await withMockFetch([
    makeResponse(200, makeResultEnvelope({
      status: 200,
      msg: 'Success',
      data: loginPayload
    }))
  ], async () => {
    await loginHandler(
      createMockReq({
        account: 'user@example.com',
        password: 'secret',
        device_id: 'device-1',
        platform_type: 'android'
      }),
      res
    );
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.authenticated, false);
  assert.equal(payload.requiresTwoFactor, true);
  assert.equal(payload.pending, true);
  assert.equal(payload.pendingToken, 'upstream-token');

  const cookieHeader = res.headers['Set-Cookie'];
  assert.ok(cookieHeader);
  const cookieValue = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  assert.match(cookieValue, /jr_odoo_pending=/);
  assert.match(cookieValue, /HttpOnly/);
  assert.match(cookieValue, /Secure/);
  assert.match(cookieValue, /SameSite=Lax/);
  assert.match(cookieValue, /Max-Age=900/);

  const encryptedToken = cookieValue.split(';')[0].split('=')[1];
  const decodedToken = getEncryptedCookie(
    {
      headers: { cookie: `jr_odoo_pending=${encryptedToken}` }
    },
    'jr_odoo_pending',
    TEST_SECRET
  );
  assert.equal(decodedToken, 'upstream-token');
});

test('POST /api/odoo/verify-otp exchanges the pending token for a final session token', async () => {
  setOdooEnv();
  const pendingToken = encryptAes256Cbc('temporary-business-token', TEST_SECRET);
  const finalTokenPayload = {
    status: 200,
    msg: 'Success',
    data: {
      token: 'final-business-token',
      verify_otp: true
    }
  };
  const res = createMockRes();

  await withMockFetch([
    makeResponse(200, makeResultEnvelope(finalTokenPayload))
  ], async () => {
    await verifyOtpHandler(
      createMockReq({
        otp: '123456',
        account: 'user@example.com'
      }, `jr_odoo_pending=${encodeURIComponent(pendingToken)}`),
      res
    );
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.authenticated, true);
  assert.equal(payload.token, 'final-business-token');
  assert.ok(String(res.headers['Set-Cookie']).includes('jr_odoo_session='));
  assert.ok(String(res.headers['Set-Cookie']).includes('jr_session='));
  assert.ok(String(res.headers['Set-Cookie']).includes('jr_odoo_pending='));
  assert.ok(String(res.headers['Set-Cookie']).includes('Max-Age=0'));
});

test('POST /api/odoo/verify-otp accepts a pending token from the request body when the cookie is unavailable', async () => {
  setOdooEnv();
  const res = createMockRes();

  await withMockFetch([
    makeResponse(200, makeResultEnvelope({
      status: 200,
      msg: 'Success',
      data: {
        token: 'final-business-token',
        verify_otp: true
      }
    }))
  ], async () => {
    await verifyOtpHandler(
      createMockReq({
        otp: '123456',
        pending_token: 'temporary-business-token',
        account: 'user@example.com'
      }),
      res
    );
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.authenticated, true);
  assert.equal(payload.token, 'final-business-token');
  assert.ok(String(res.headers['Set-Cookie']).includes('jr_session='));
});

test('POST /api/odoo/login rejects invalid credentials and clears the Odoo cookie', async () => {
  setOdooEnv();
  const res = createMockRes();

  await withMockFetch([
    makeResponse(401, 'invalid credentials', false)
  ], async () => {
    await loginHandler(
      createMockReq({
        account: 'user@example.com',
        password: 'wrong',
        device_id: 'device-1',
        platform_type: 'android'
      }),
      res
    );
  });

  assert.equal(res.statusCode, 401);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, false);
  assert.match(payload.message, /invalid/i);
  assert.ok(String(res.headers['Set-Cookie']).includes('Max-Age=0'));
});

test('GET /api/odoo/me returns 401 when the Odoo session cookie is missing', async () => {
  setOdooEnv();
  const res = createMockRes();

  await meHandler(createMockReq({}), res);

  assert.equal(res.statusCode, 401);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, 'ODOO_NOT_AUTHENTICATED');
});

test('GET /api/odoo/me clears the cookie when upstream session is expired', async () => {
  setOdooEnv();
  const loginToken = 'encrypted-token';
  const cookie = encryptAes256Cbc(loginToken, TEST_SECRET);
  const res = createMockRes();

  await withMockFetch([
    makeResponse(401, 'expired', false)
  ], async () => {
    await meHandler(
      createMockReq({}, `jr_odoo_session=${encodeURIComponent(cookie)}`),
      res
    );
  });

  assert.equal(res.statusCode, 401);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, false);
  assert.ok(String(res.headers['Set-Cookie']).includes('Max-Age=0'));
});

test('GET /api/odoo/me accepts the final token from an Authorization header', async () => {
  setOdooEnv();
  const bearerToken = encryptAes256Cbc('final-business-token', TEST_SECRET);
  const res = createMockRes();

  await withMockFetch([
    makeResponse(200, makeEnvelope({
      id: 7,
      user_id: 77,
      name: 'Nguyen Van A',
      login: 'user@etc.vn',
      display_name: 'Nguyen Van A',
      email: 'user@etc.vn',
      company_id: 1,
      company_name: 'ETC',
      total_over_time: 6.5,
      department: { id: 2, name: 'IT', level: 3, manager: {} }
    }))
  ], async () => {
    await meHandler(
      {
        body: {},
        headers: { authorization: `Bearer ${bearerToken}` }
      },
      res
    );
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.over_time, 6.5);
  assert.equal(payload.total_over_time, 6.5);
  assert.equal(payload.profile.email, 'user@etc.vn');
});

test('POST /api/odoo/logout clears only the Odoo cookie', async () => {
  setOdooEnv();
  const res = createMockRes();

  await logoutHandler(createMockReq({}), res);

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, true);
  assert.ok(String(res.headers['Set-Cookie']).includes('jr_odoo_session='));
  assert.ok(String(res.headers['Set-Cookie']).includes('Max-Age=0'));
});

test('local jira-server dispatches /api/odoo/login instead of returning 404', async () => {
  setOdooEnv();
  const loginPayload = { id: 9, token: 'local-upstream-token' };
  const req = createMockReq({
    account: 'local@example.com',
    password: 'secret',
    device_id: 'device-1',
    platform_type: 'android'
  });
  req.method = 'POST';
  req.url = '/api/odoo/login';
  req.headers.origin = 'http://localhost:3456';
  const res = createMockRes();

  await withMockFetch([
    makeResponse(200, makeResultEnvelope({
      status: 200,
      msg: 'Success',
      data: loginPayload
    }))
  ], async () => {
    await handleRequest(req, res);
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Access-Control-Allow-Credentials'], 'true');
  assert.match(String(res.headers['Access-Control-Allow-Methods']), /POST/);
  assert.match(String(res.body), /"requiresTwoFactor":true/);
});

test('local jira-server answers Odoo preflight with POST allowed', async () => {
  const req = createMockReq({});
  req.method = 'OPTIONS';
  req.url = '/api/odoo/login';
  req.headers.origin = 'http://localhost:3456';
  const res = createMockRes();

  await handleRequest(req, res);

  assert.equal(res.statusCode, 204);
  assert.match(String(res.headers['Access-Control-Allow-Methods']), /POST/);
  assert.equal(res.headers['Access-Control-Allow-Credentials'], 'true');
});

test('login page smoke checks the Google and Odoo entry points', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'login.html'), 'utf8');
  assert.match(html, /id="odooLoginBtn"/);
  assert.match(html, /href="odoo-auth\.html"/);
  assert.match(html, /Đăng nhập Odoo/);
  assert.match(html, /Chọn Google để vào dashboard Jira hoặc SSO để đăng nhập bằng account và password\./);
});

test('Odoo auth page smoke checks the reduced form and API wiring', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'odoo-auth.html'), 'utf8');
  assert.match(html, /networkCanvas/);
  assert.match(html, /bg-layer mesh/);
  assert.match(html, /login-shell/);
  assert.match(html, /login-card/);
  assert.match(html, /radar-ring/);
  assert.match(html, /\/api\/odoo\/login/);
  assert.match(html, /id="loginForm"/);
  assert.match(html, /id="loginStep"/);
  assert.match(html, /Đăng nhập ETC/);
  assert.match(html, /id="deviceId" name="device_id" type="hidden"/);
  assert.match(html, /id="platformType" name="platform_type" type="hidden" value="android"/);
  assert.match(html, /Chỉ hỗ trợ tài khoản ETC/);
  assert.match(html, /id="otpForm"/);
  assert.match(html, /id="otpCode"/);
  assert.match(html, /\/api\/odoo\/verify-otp/);
  assert.match(html, /odoo_session_token/);
  assert.match(html, /jira-dashboard\.html/);
  assert.match(html, /odoo_token=/);
});

test('ULNN modal smoke checks the OT-by-month table wiring', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'jira-dashboard.html'), 'utf8');
  assert.match(html, /OT theo tháng/);
  assert.match(html, /id="ulnnOtSection"/);
  assert.match(html, /id="ulnnOtTable"/);
  assert.match(html, /id="ulnnOtTableBody"/);
  assert.match(html, /id="ulnnOtSummary"/);
  assert.match(html, /ULNN_OT_STORAGE_KEY/);
  assert.match(html, /renderUlnnOtSection/);
  assert.match(html, /getUlnnOtValue/);
  assert.match(html, /ulnnModalBaseState/);
  assert.match(html, /worklogDays \* 7 \+ otHours/);
});

test('dashboard smoke checks the Odoo OT stat and profile hydration wiring', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'jira-dashboard.html'), 'utf8');
  assert.match(html, /Giờ OT/);
  assert.match(html, /odoo_session_token/);
  assert.match(html, /consumeOdooSessionTokenFromHash/);
  assert.match(html, /\/api\/odoo\/me/);
  assert.match(html, /Authorization: 'Bearer ' \+ token/);
  assert.match(html, /hydrateOdooSession/);
  assert.match(html, /resolveDefaultAssigneeQuery/);
  assert.match(html, /profile\.login/);
  assert.match(html, /profile\.email/);
  assert.match(html, /totalLeaveRequest/);
  assert.match(html, /odooLeaveHours/);
  assert.match(html, /DEFAULT_ASSIGNEE_QUERY/);
  assert.match(html, /renderStatCards/);
  assert.match(html, /var leaveHours = isLoggedInOdooAccount\(k\) \? Number\(odooLeaveHours \|\| 0\) : 0;/);
  assert.match(html, /var numerator = Math\.max\(0, \(ngayCongAssignee \* 7\) \+ overtimeHours - leaveHours\);/);
  assert.match(html, /isLoggedInOdooAccount\(key\) && odooOverTimeHours !== null && odooOverTimeHours !== undefined/);
  assert.match(html, /Nghỉ phép: ' \+ odooLeaveText/);
  assert.ok(
    html.indexOf('await hydrateOdooSession();') > -1 &&
    html.indexOf('await applyDefaultAssignee();') > -1 &&
    html.indexOf('await hydrateOdooSession();') < html.indexOf('await applyDefaultAssignee();'),
    'hydrateOdooSession should run before applyDefaultAssignee'
  );
});

test('config failures return a clear error shape', async () => {
  delete process.env.ODOO_API_BASE;
  delete process.env.ODOO_AUTH_SECRET;
  const res = createMockRes();

  await loginHandler(createMockReq({
    account: 'user@example.com',
    password: 'secret',
    device_id: 'device-1',
    platform_type: 'android'
  }), res);

  assert.equal(res.statusCode, 500);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, 'ODOO_CONFIG_ERROR');
});

test('the Odoo session age matches the planned 7-day window', () => {
  assert.equal(DEFAULT_SESSION_AGE_SECONDS, 604800);
});
