import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET is required in visualmind-backend/.env');
}

const userId = process.argv[2] || '00000000-0000-0000-0000-000000000001';
const email = process.argv[3] || 'dev@visualmind.local';
const role = process.argv[4] || 'member';
const expiresIn = process.argv[5] || '7d';

const token = jwt.sign(
  {
    sub: userId,
    email,
    role,
  },
  jwtSecret,
  { expiresIn },
);

console.log(token);
