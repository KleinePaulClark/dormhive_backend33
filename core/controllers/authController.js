import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import {
  create,
  createPasswordResetToken,
  consumePasswordResetToken,
  findByEmail,
  findByUsername,
  promoteToOwner,
  recordLogin,
  revokePasswordResetToken,
  updatePassword,
  updatePendingRegistrationRole
} from '../models/User.js';
import { isEmailConfigured, sendPasswordResetEmail } from '../services/email.js';

const googleOAuthClient = new OAuth2Client();

function tokenFor(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m' });
}

async function createSocialAccount(profile, email) {
  const fullName = String(profile.name ?? '').trim();
  const nameParts = fullName ? fullName.split(/\s+/) : [];
  const firstName = String(profile.given_name ?? profile.first_name ?? nameParts.shift() ?? email.split('@')[0]).trim();
  const lastName = String(profile.family_name ?? profile.last_name ?? nameParts.join(' ')).trim();
  const name = fullName || [firstName, lastName].filter(Boolean).join(' ');

  try {
    return await create({
      name,
      first_name: firstName,
      last_name: lastName,
      username: null,
      email,
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
      phone: null,
      role: 'tenant'
    });
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
    const existingUser = await findByEmail(email);
    if (!existingUser) throw error;
    return existingUser;
  }
}

const oauthProviders = {
  google: {
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile'
  },
  facebook: {
    clientId: () => process.env.FACEBOOK_CLIENT_ID,
    clientSecret: () => process.env.FACEBOOK_CLIENT_SECRET,
    authorizeUrl: 'https://www.facebook.com/v27.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v27.0/oauth/access_token',
    scope: 'email,public_profile'
  }
};

function oauthRedirectUri(provider) {
  const apiUrl = (process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 5000}`).replace(/\/+$/, '');
  return `${apiUrl}/api/v1/auth/${provider}/callback`;
}

function frontendCallback({ mode, accessToken, registrationToken, error, firstLogin = false }) {
  const clientUrl = (process.env.CLIENT_URL ?? 'https://dormhive-frontend.vercel.app').replace(/\/+$/, '');
  const query = new URLSearchParams({ mode });
  if (error) query.set('error', error);
  if (firstLogin) query.set('firstLogin', 'true');
  const fragment = new URLSearchParams();
  if (accessToken) fragment.set('accessToken', accessToken);
  if (registrationToken) fragment.set('registrationToken', registrationToken);
  return `${clientUrl}/#/oauth/callback?${query}${fragment.size ? `#${fragment}` : ''}`;
}

function oauthState(provider, mode, role, nonce) {
  return jwt.sign({
    provider,
    mode,
    role,
    nonce,
    purpose: 'oauth'
  }, process.env.JWT_ACCESS_SECRET, { expiresIn: '10m' });
}

function oauthStateCookieName(provider) {
  return `dormhive_oauth_${provider}`;
}

function oauthStateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/v1/auth'
  };
}

function oauthStateCookie(request, provider) {
  const name = oauthStateCookieName(provider);
  const cookies = String(request.headers.cookie ?? '').split(';');
  const cookie = cookies.map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return cookie?.slice(name.length + 1);
}

function readOAuthState(value, provider, nonce) {
  const state = jwt.verify(value, process.env.JWT_ACCESS_SECRET);
  if (
    state.purpose !== 'oauth'
    || state.provider !== provider
    || !oauthProviders[state.provider]
    || !nonce
    || state.nonce !== nonce
    || !['login', 'register'].includes(state.mode)
    || !['tenant', 'owner'].includes(state.role)
  ) throw new Error('Invalid OAuth state.');
  return state;
}

async function exchangeOAuthCode(provider, code) {
  const config = oauthProviders[provider];
  const redirectUri = oauthRedirectUri(provider);
  const tokenParams = new URLSearchParams({ client_id: config.clientId(), client_secret: config.clientSecret(), code, redirect_uri: redirectUri });
  let tokenResponse;
  if (provider === 'google') {
    tokenParams.set('grant_type', 'authorization_code');
    tokenResponse = await fetch(config.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenParams });
  } else {
    tokenResponse = await fetch(`${config.tokenUrl}?${tokenParams}`);
  }
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error_description || tokens.error?.message || 'OAuth token exchange failed.');
  const profileUrl = provider === 'google'
    ? 'https://openidconnect.googleapis.com/v1/userinfo'
    : 'https://graph.facebook.com/v27.0/me?fields=id,name,first_name,last_name,email,picture';
  const profileResponse = await fetch(profileUrl, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const profile = await profileResponse.json();
  if (!profileResponse.ok || !profile.email) throw new Error('The OAuth provider did not return an email address.');
  if (provider === 'google' && profile.email_verified !== true) {
    throw new Error('Verify your Google email address before using it with DormHive.');
  }
  return profile;
}

export function oauthStart(request, response) {
  const provider = String(request.params.provider ?? '').toLowerCase();
  const config = oauthProviders[provider];
  if (!config) return response.status(404).json({ message: 'Unsupported OAuth provider.' });
  if (!config.clientId() || !config.clientSecret()) {
    return response.redirect(frontendCallback({ mode: request.query.mode === 'register' ? 'register' : 'login', error: `${provider} sign-in is not configured on the server.` }));
  }
  const mode = request.query.mode === 'register' ? 'register' : 'login';
  const role = ['tenant', 'owner'].includes(request.query.role) ? request.query.role : 'tenant';
  const nonce = crypto.randomBytes(32).toString('hex');
  const state = oauthState(provider, mode, role, nonce);
  response.cookie(oauthStateCookieName(provider), nonce, {
    ...oauthStateCookieOptions(),
    maxAge: 10 * 60 * 1000
  });
  const params = new URLSearchParams({ client_id: config.clientId(), redirect_uri: oauthRedirectUri(provider), response_type: 'code', scope: config.scope, state });
  return response.redirect(`${config.authorizeUrl}?${params}`);
}

export async function oauthCallback(request, response) {
  const provider = String(request.params.provider ?? '').toLowerCase();
  let mode = 'login';
  const cookieName = oauthStateCookieName(provider);
  response.clearCookie(cookieName, oauthStateCookieOptions());
  try {
    const state = readOAuthState(request.query.state, provider, oauthStateCookie(request, provider));
    mode = state.mode;
    if (request.query.error) throw new Error('Google/Facebook sign-in was cancelled or denied.');
    if (!request.query.code) throw new Error('The OAuth provider did not return an authorization code.');
    const profile = await exchangeOAuthCode(provider, request.query.code);
    const email = String(profile.email).trim().toLowerCase();
    let user = await findByEmail(email);

    if (mode === 'register') {
      if (user) throw new Error('An account with this email already exists. Continue from the login form instead.');
      const fullName = String(profile.name ?? '').trim().split(/\s+/);
      const registrationToken = jwt.sign({
        purpose: 'oauth-registration',
        provider,
        email,
        first_name: String(profile.given_name ?? profile.first_name ?? fullName.shift() ?? '').trim(),
        last_name: String(profile.family_name ?? profile.last_name ?? fullName.join(' ')).trim(),
        role: state.role
      }, process.env.JWT_ACCESS_SECRET, { expiresIn: '10m' });
      return response.redirect(frontendCallback({ mode, registrationToken }));
    }

    if (!user) {
      user = await createSocialAccount(profile, email);
    }
    if (user.verification_status === 'pending') throw new Error('Your account is awaiting admin verification. We will email you when it has been reviewed.');
    if (user.verification_status === 'rejected') throw new Error('Your account verification was rejected. Please check your email for details.');
    if (user.status !== 'active') throw new Error('This account is not active.');
    if (user.role === 'admin') throw new Error('Administrator accounts must sign in with their DormHive credentials.');
    const firstLogin = !user.last_login_at;
    user = await recordLogin(user.id);
    return response.redirect(frontendCallback({ mode, accessToken: tokenFor(user), firstLogin }));
  } catch (error) {
    return response.redirect(frontendCallback({ mode, error: error.message || 'OAuth sign-in failed.' }));
  }
}

export function isValidPhilippinePhoneNumber(value) {
  return normalizePhilippinePhoneNumber(value) !== null;
}

export function normalizePhilippinePhoneNumber(value) {
  if (typeof value !== 'string' || !/^\+?[\d\s().-]+$/.test(value.trim())) return null;
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('63')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('09')) digits = digits.slice(1);
  return /^9\d{9}$/.test(digits) ? `+63${digits}` : null;
}

function isValidPhone(value) {
  return typeof value === 'string' && /^\+?[0-9\s().-]{7,20}$/.test(value.trim());
}

export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidUsername(value) {
  return typeof value === 'string' && /^[a-z0-9._]{3,30}$/.test(value);
}

export function googleAuthConfig(_request, response) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  response.set('Cache-Control', 'no-store');
  if (!clientId) {
    return response.status(503).json({ message: 'Google sign-in is not configured on the server.' });
  }
  return response.json({ clientId });
}

export async function googleLogin(request, response, next) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return response.status(503).json({ message: 'Google sign-in is not configured on the server.' });
    }

    const credential = String(request.body.credential ?? '').trim();
    if (!credential) return response.status(422).json({ message: 'A Google credential is required.' });

    let profile;
    try {
      const ticket = await googleOAuthClient.verifyIdToken({ idToken: credential, audience: clientId });
      profile = ticket.getPayload();
    } catch {
      return response.status(401).json({ message: 'The Google credential is invalid or expired. Please try again.' });
    }

    if (!profile?.email || profile.email_verified !== true) {
      return response.status(401).json({ message: 'Use a verified Google email address to sign in.' });
    }

    const email = String(profile.email).trim().toLowerCase();
    let user = await findByEmail(email);
    if (!user) {
      user = await createSocialAccount(profile, email);
    }
    if (user.role === 'admin') {
      return response.status(403).json({ message: 'Administrator accounts must sign in with their DormHive credentials.' });
    }
    const rejection = loginRejection(user, true);
    if (rejection) return response.status(rejection.status).json({ message: rejection.message });

    const firstLogin = !user.last_login_at;
    user = await recordLogin(user.id);
    const accessToken = tokenFor(user);
    delete user.password_hash;
    return response.json({ user, accessToken, firstLogin });
  } catch (error) {
    return next(error);
  }
}

export async function register(request, response, next) {
  try {
    const { first_name, last_name, name, username, email, password, role = 'tenant', phone } = request.body;
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = typeof phone === 'string' ? phone.trim() : phone;
    const oauthRegistrationToken = String(request.body.oauthRegistrationToken ?? '').trim();
    if (oauthRegistrationToken) {
      try {
        const registration = jwt.verify(oauthRegistrationToken, process.env.JWT_ACCESS_SECRET);
        if (
          registration.purpose !== 'oauth-registration'
          || !oauthProviders[registration.provider]
          || registration.email !== normalizedEmail
          || registration.role !== role
        ) throw new Error('Invalid OAuth registration ticket.');
      } catch {
        return response.status(422).json({ message: 'Your social registration session is invalid or expired. Please start registration again.' });
      }
    }
    if (!['tenant', 'owner'].includes(role)) return response.status(422).json({ message: 'Role must be tenant or owner.' });
    if (!isValidUsername(normalizedUsername)) {
      return response.status(422).json({ message: 'Username must be 3–30 characters and use only letters, numbers, periods, or underscores.' });
    }
    if (!normalizedPhone || !isValidPhilippinePhoneNumber(normalizedPhone)) {
      return response.status(422).json({ message: 'Phone number must be exactly 10 digits.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || password.length < 8 || (normalizedPhone && !isValidPhone(normalizedPhone))) {
      return response.status(422).json({ message: 'Provide a valid email, a valid phone number if supplied, and a password of at least 8 characters.' });
    }
    if (await findByUsername(normalizedUsername)) return response.status(409).json({ message: 'This username is already taken. Please choose another one.' });
    if (await findByEmail(normalizedEmail)) return response.status(409).json({ message: 'This email already has an account. Please log in instead.' });
    const computedName = name ?? ([first_name, last_name].filter(Boolean).join(' ').trim() || null);
    try {
      const user = await create({
        name: computedName,
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash: await bcrypt.hash(password, 12),
        phone: normalizedPhone ? String(normalizedPhone).trim() : null,
        role,
        status: 'pending',
        verificationStatus: 'pending'
      });
      const onboardingToken = jwt.sign(
        { sub: user.id, purpose: 'registration-onboarding' },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      );
      response.status(201).json({
        user,
        onboardingToken,
        message: 'Your account is submitted for review. You can sign in after an admin reviews your application. We will email you with the decision.'
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return response.status(409).json({ message: 'This username or email already has an account. Please log in instead.' });
      }
      throw error;
    }
  } catch (error) { next(error); }
}

export async function setRegistrationRole(request, response, next) {
  const onboardingToken = String(request.body.onboardingToken ?? '').trim();
  const { role } = request.body;
  if (!onboardingToken) return response.status(422).json({ message: 'A registration onboarding token is required.' });
  if (!['tenant', 'owner'].includes(role)) return response.status(422).json({ message: 'Role must be tenant or owner.' });

  let registration;
  try {
    registration = jwt.verify(onboardingToken, process.env.JWT_ACCESS_SECRET);
  } catch {
    return response.status(422).json({ message: 'Your registration onboarding session is invalid or expired.' });
  }
  if (registration.purpose !== 'registration-onboarding' || !registration.sub) {
    return response.status(422).json({ message: 'Your registration onboarding session is invalid or expired.' });
  }

  try {
    const user = await updatePendingRegistrationRole(registration.sub, role);
    if (!user) {
      return response.status(409).json({ message: 'Your account is no longer awaiting review, so this choice cannot be changed.' });
    }
    return response.json({ user, message: 'Your account role has been saved for review.' });
  } catch (error) {
    return next(error);
  }
}

export function loginRejection(user, passwordMatches) {
  if (!user || !passwordMatches) return { status: 401, message: 'Invalid username/email or password.' };
  if (user.status === 'archived') {
    return {
      status: 403,
      message: 'This account has been archived and can’t sign in. Contact DormHive support if you think this is a mistake.'
    };
  }
  if (user.verification_status === 'pending' || user.status === 'pending') {
    return { status: 403, message: 'Your account is awaiting admin verification. We will email you when it has been reviewed.' };
  }
  if (user.verification_status === 'rejected') {
    return { status: 403, message: 'Your account verification was rejected. Please check your email for details or contact DormHive support.' };
  }
  if (user.status === 'suspended') {
    return { status: 403, message: 'Your account has been suspended. Please contact the administrator for assistance.' };
  }
  if (user.status !== 'active') return { status: 401, message: 'Invalid username/email or password.' };
  return null;
}

export async function login(request, response, next) {
  try {
    const identifier = String(request.body.identifier ?? request.body.email ?? '').trim();
    if (!identifier) return response.status(422).json({ message: 'Enter your username or email address.' });
    let user = identifier.includes('@')
      ? await findByEmail(identifier.toLowerCase())
      : await findByUsername(normalizeUsername(identifier));
    const passwordMatches = user ? await bcrypt.compare(request.body.password ?? '', user.password_hash) : false;
    const rejection = loginRejection(user, passwordMatches);
    if (rejection) return response.status(rejection.status).json({ message: rejection.message });
    const firstLogin = !user.last_login_at;
    user = await recordLogin(user.id);
    delete user.password_hash;
    response.json({ user, accessToken: tokenFor(user), firstLogin });
  } catch (error) { next(error); }
}

export async function becomeOwner(request, response, next) {
  try {
    if (request.user.role === 'owner') {
      return response.json({ user: request.user, accessToken: tokenFor(request.user) });
    }
    if (request.user.role !== 'tenant') {
      return response.status(403).json({ message: 'Only tenant accounts can become property owners.' });
    }
    const user = await promoteToOwner(request.user.id);
    if (!user) {
      return response.status(409).json({ message: 'Your account could not be updated to a property owner. Please try again.' });
    }
    return response.json({ user, accessToken: tokenFor(user) });
  } catch (error) {
    return next(error);
  }
}

export function logout(_request, response) { response.status(204).end(); }

export function passwordResetEmailStatus(_request, response) {
  response.set('Cache-Control', 'no-store');
  response.json({ available: isEmailConfigured() });
}

export async function requestPasswordResetEmail(request, response, next) {
  try {
    if (!isEmailConfigured()) {
      return response.status(503).json({ message: 'Password recovery is unavailable. Please contact support.' });
    }
    const email = String(request.body.email ?? '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return response.status(422).json({ message: 'Enter a valid email address.' });
    const user = await findByEmail(email);
    if (!user || user.status !== 'active') {
      return response.json({ message: 'If an active account matches that email, a reset link has been sent.' });
    }

    const token = await createPasswordResetToken(user.id);
    const clientUrl = (process.env.CLIENT_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const resetUrl = `${clientUrl}/#/reset-password?token=${encodeURIComponent(token)}`;
    try {
      const result = await sendPasswordResetEmail({ email: user.email, name: user.name, resetUrl });
      if (!result.sent) throw new Error('SMTP is not configured.');
    } catch (error) {
      await revokePasswordResetToken(token);
      console.error('Unable to send password reset email.', error.message);
      return response.status(503).json({ message: 'Password recovery is unavailable. Please contact support.' });
    }
    response.json({ message: 'If an active account matches that email, a reset link has been sent.' });
  } catch (error) { next(error); }
}

export async function resetPassword(request, response, next) {
  try {
    const token = String(request.body.token ?? '');
    const password = String(request.body.password ?? '');
    if (!token || password.length < 8) return response.status(422).json({ message: 'A valid token and password of at least 8 characters are required.' });
    const userId = await consumePasswordResetToken(token);
    if (!userId) return response.status(400).json({ message: 'This reset link is invalid or expired.' });
    await updatePassword(userId, await bcrypt.hash(password, 12));
    response.json({ message: 'Password updated successfully. You can now sign in.' });
  } catch (error) { next(error); }
}
