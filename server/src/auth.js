import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'snapchef-dev-secret-change-me';

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, { expiresIn: '30d' });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}
