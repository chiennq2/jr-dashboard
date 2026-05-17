const { buildOdooUrl } = require('./_config');
const { decryptAes256Cbc, encryptAes256Cbc } = require('./_crypto');

function createOdooError(code, message, statusCode, details) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  err.details = details || null;
  return err;
}

function safeJsonParse(value, fallbackMessage, statusCode, code) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw createOdooError(code, fallbackMessage, statusCode, { cause: error.message });
  }
}

function decodeUpstreamEnvelope(rawText, authSecret) {
  const decrypted = decryptAes256Cbc(rawText, authSecret);
  const envelope = safeJsonParse(decrypted, 'Upstream payload is not valid JSON', 502, 'ODOO_BAD_ENVELOPE');

  if (typeof envelope !== 'object' || envelope === null) {
    throw createOdooError('ODOO_BAD_ENVELOPE', 'Upstream payload is invalid', 502);
  }

  if (Object.prototype.hasOwnProperty.call(envelope, 'result') && typeof envelope.result === 'object' && envelope.result !== null) {
    return envelope.result;
  }

  return envelope;
}

function parseUpstreamData(envelope) {
  if (!envelope || typeof envelope.data === 'undefined' || envelope.data === null) {
    throw createOdooError('ODOO_BAD_DATA', 'Upstream payload is missing data', 502);
  }

  if (typeof envelope.data === 'string') {
    return safeJsonParse(envelope.data, 'Upstream data field is not valid JSON', 502, 'ODOO_BAD_DATA');
  }

  return envelope.data;
}

function getUpstreamFailureMessage(result, fallbackMessage) {
  if (result && typeof result.msg === 'string' && result.msg.trim()) {
    return result.msg.trim();
  }
  return fallbackMessage;
}

function normalizeDepartment(department) {
  const departmentInfo = department || {};
  const manager = departmentInfo.manager || {};

  return {
    id: departmentInfo.id ?? null,
    name: departmentInfo.name || '',
    level: departmentInfo.level ?? null,
    manager: {
      id: manager.id ?? null,
      name: manager.name || '',
      account: manager.account || '',
      email: manager.email || ''
    }
  };
}

function normalizeProfile(profile) {
  const info = profile || {};
  const manager = info.manager || {};
  const approveOtRequest = info.approve_ot_request || {};
  const approveOtManager = approveOtRequest.manager || {};
  const lunchPayment = info.inform_auto_payment_lunch || {};

  return {
    id: info.id ?? null,
    userId: info.user_id ?? null,
    name: info.name || '',
    login: info.login || '',
    displayName: info.display_name || info.name || '',
    email: info.email || '',
    address: info.address || '',
    mobilePhone: info.mobile_phone || '',
    jobTitle: info.job_title || '',
    company: {
      id: info.company_id ?? null,
      name: info.company_name || ''
    },
    avatarUrl: info.avatar_1024 || '',
    isManager: Boolean(info.is_manager),
    department: normalizeDepartment(info.department),
    stats: {
      totalLeaveRequest: info.total_leave_request ?? 0,
      totalOverTime: info.total_over_time ?? 0,
      checkIn: info.check_in || '',
      checkOut: info.check_out || '',
      totalLateDay: info.total_late_day ?? 0,
      currentResidence: info.current_residence || '',
      canWeek: Boolean(info.can_week),
      biometry: Boolean(info.biometry),
      biometryType: info.biometry_type || '',
      violation: Boolean(info.violation),
      eWorkDay: Array.isArray(info.e_work_day) ? info.e_work_day : []
    },
    lunchPayment: {
      epayWalletAccount: lunchPayment.epay_wallet_account || '',
      statusAutoPayment: Boolean(lunchPayment.status_auto_payment),
      activationDate: lunchPayment.activation_date || ''
    },
    manager: {
      level: manager.level ?? null
    },
    approvals: {
      assetRequest: info.approve_asset_request || {},
      otRequest: {
        manager: {
          id: approveOtManager.id ?? null,
          name: approveOtManager.name || '',
          account: approveOtManager.account || '',
          email: approveOtManager.email || ''
        }
      },
      leaveRequest: info.approve_leave_request || {},
      etcFormManagement: info.etc_form_management || {}
    },
    flags: {
      itConfirm: Boolean(info.it_confirm),
      violation: Boolean(info.violation),
      canWeek: Boolean(info.can_week)
    }
  };
}

async function readRequestBody(req) {
  if (req && typeof req.body === 'object' && req.body !== null) {
    return req.body;
  }

  if (req && typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body);
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(createOdooError('ODOO_BAD_REQUEST', 'Request body must be valid JSON', 400, { cause: error.message }));
      }
    });
    req.on('error', reject);
  });
}

function getAuthHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': '*'
  };
}

async function callUpstreamLogin(config, credentials) {
  const encryptedBody = encryptAes256Cbc(JSON.stringify(credentials), config.authSecret);
  const response = await fetch(buildOdooUrl(config, '/api/v1/login'), {
    method: 'POST',
    headers: {
      'Content-Type': '*'
    },
    body: encryptedBody
  });

  const rawText = await response.text();
  // console.log('[ODOO] login upstream response', {
  //   status: response.status,
  //   ok: response.ok,
  //   body: rawText
  // });
  if (!response.ok) {
    throw createOdooError(
      'ODOO_LOGIN_FAILED',
      response.status === 401 || response.status === 403 ? 'Invalid Odoo credentials' : 'Odoo login request failed',
      response.status === 401 || response.status === 403 ? 401 : 502,
      { upstreamStatus: response.status, raw: rawText }
    );
  }

  const result = decodeUpstreamEnvelope(rawText, config.authSecret);
  if (result.error || result.status !== 200) {
    throw createOdooError(
      'ODOO_LOGIN_FAILED',
      getUpstreamFailureMessage(result, 'Invalid Odoo credentials'),
      401,
      { upstreamEnvelope: result }
    );
  }

  const data = parseUpstreamData(result);
  if (!data.token || typeof data.token !== 'string') {
    throw createOdooError('ODOO_LOGIN_FAILED', 'Upstream login response missing token', 502, { upstreamEnvelope: result });
  }

  return {
    token: data.token,
    result,
    data
  };
}

async function callUpstreamVerifyOtp(config, token, otp) {
  const encryptedBody = encryptAes256Cbc(JSON.stringify({ otp }), config.authSecret);
  const response = await fetch(buildOdooUrl(config, '/api/v1/2fa-verify-qr-code'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': '*'
    },
    body: encryptedBody
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw createOdooError(
      'ODOO_OTP_FAILED',
      response.status === 400 || response.status === 401 || response.status === 403 ? 'Invalid OTP code' : 'Odoo OTP verification failed',
      response.status === 400 || response.status === 401 || response.status === 403 ? 401 : 502,
      { upstreamStatus: response.status, raw: rawText }
    );
  }

  const result = decodeUpstreamEnvelope(rawText, config.authSecret);
  if (result.error || result.status !== 200) {
    throw createOdooError(
      'ODOO_OTP_FAILED',
      getUpstreamFailureMessage(result, 'Invalid OTP code'),
      401,
      { upstreamEnvelope: result }
    );
  }

  const data = parseUpstreamData(result);
  if (!data.token || typeof data.token !== 'string') {
    throw createOdooError('ODOO_OTP_FAILED', 'Upstream OTP response missing token', 502, { upstreamEnvelope: result });
  }
  if (data.verify_otp !== true) {
    throw createOdooError('ODOO_OTP_FAILED', 'OTP verification was not confirmed', 401, { upstreamEnvelope: result });
  }

  return {
    token: data.token,
    result,
    data
  };
}

async function callUpstreamMe(config, token) {
  const response = await fetch(buildOdooUrl(config, '/api/v1/me'), {
    method: 'GET',
    headers: getAuthHeaders(token)
  });

  const rawText = await response.text();
  // console.log('[ODOO] me upstream response', {
  //   status: response.status,
  //   ok: response.ok,
  //   body: rawText
  // });
  if (!response.ok) {
    throw createOdooError(
      'ODOO_PROFILE_FAILED',
      response.status === 401 || response.status === 403 ? 'Odoo session expired' : 'Odoo profile request failed',
      response.status === 401 || response.status === 403 ? 401 : 502,
      { upstreamStatus: response.status, raw: rawText }
    );
  }

  const result = decodeUpstreamEnvelope(rawText, config.authSecret);
  if (result.error || result.status !== 200) {
    throw createOdooError(
      'ODOO_PROFILE_FAILED',
      getUpstreamFailureMessage(result, 'Odoo profile request failed'),
      502,
      { upstreamEnvelope: result }
    );
  }

  const profile = parseUpstreamData(result);
  return {
    result,
    profile,
    normalizedProfile: normalizeProfile(profile)
  };
}

module.exports = {
  createOdooError,
  safeJsonParse,
  decodeUpstreamEnvelope,
  parseUpstreamData,
  normalizeDepartment,
  normalizeProfile,
  readRequestBody,
  getAuthHeaders,
  getUpstreamFailureMessage,
  callUpstreamLogin,
  callUpstreamVerifyOtp,
  callUpstreamMe
};
