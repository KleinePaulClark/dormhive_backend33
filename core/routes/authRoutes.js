import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { becomeOwner, googleAuthConfig, googleLogin, login, logout, oauthCallback, oauthStart, passwordResetEmailStatus, register, requestPasswordResetEmail, resetPassword, setRegistrationRole } from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
const router = Router();
const passwordResetLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 50,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: { message: 'Too many password reset attempts. Please try again later.' }
});
const googleLoginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 30,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: { message: 'Too many Google sign-in attempts. Please try again later.' }
});
router.post('/register', validate(['first_name', 'last_name', 'username', 'email', 'password']), register);
router.post('/registration-role', validate(['onboardingToken', 'role']), setRegistrationRole);
router.post('/login', validate(['password']), login);
router.get('/password-reset/status', passwordResetEmailStatus);
router.post('/password-reset/request', passwordResetLimiter, validate(['email']), requestPasswordResetEmail);
router.post('/password-reset/confirm', validate(['token', 'password']), resetPassword);
router.get('/google/config', googleAuthConfig);
router.post('/google', googleLoginLimiter, validate(['credential']), googleLogin);
router.post('/become-owner', authenticate, becomeOwner);
router.post('/logout', logout);
router.get('/:provider/start', oauthStart);
router.get('/:provider/callback', oauthCallback);
export default router;
