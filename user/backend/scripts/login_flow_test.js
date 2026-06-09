import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import crypto from 'k6/crypto';

// 加载学生列表
const studentsJson = open('./students.json');
const students = JSON.parse(studentsJson);
const totalStudents = students.length;

// 预计算 hash（只算一次，避免每次迭代 CPU 爆炸）
const HASH_123456 = crypto.sha256('123456', 'hex');
const HASH_654321 = crypto.sha256('654321', 'hex');

const apiBase = __ENV.API_BASE || 'http://101.37.238.186';

function randomIntBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function setBit(bitmap, idx) {
  return bitmap | (1 << idx);
}
function clearBit(bitmap, idx) {
  return bitmap & ~(1 << idx);
}

// 1000 QPS = 每秒 1000 次迭代，每次迭代发 3 个请求（登录、改密、再登录）
export const options = {
  scenarios: {
    login_flow: {
      executor: 'shared-iterations',
      vus: 300,
      iterations: totalStudents,
      maxDuration: '10m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

function login(student_id, passwordHash) {
  const body = JSON.stringify({ student_id, password: passwordHash });
  const res = http.post(
    `${apiBase}/api/student/login`,
    body,
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, {
    'login status 200': (r) => r.status === 200,
  });
  return res.status === 200 ? res.json('token') : null;
}

function changePassword(token, sid, oldHash, newHash) {
  const body = JSON.stringify({ old_password: oldHash, new_password: newHash });
  const res = http.post(
    `${apiBase}/api/student/change-password`,
    body,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  check(res, {
    'change-password status 200': (r) => r.status === 200,
  });
  return res.status === 200;
}

function getTextbooks(token) {
  const res = http.get(`${apiBase}/api/student/textbooks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(res, {
    'textbooks status 200': (r) => r.status === 200,
  });
  return res.status === 200 ? res.json() : null;
}

function submitBitmap(token, sid, bitmap) {
  const body = JSON.stringify({ new_bitmap: String(bitmap) });
  const res = http.post(
    `${apiBase}/api/student/bitmap`,
    body,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  check(res, {
    'bitmap status 200': (r) => r.status === 200,
  });
  return res.status === 200;
}

export default function () {
  const idx = exec.scenario.iterationInTest % totalStudents;
  const student = students[idx];
  const sid = student.student_id;

  // 1. 用默认密码登录
  let token = login(sid, HASH_123456);

  // 如果默认密码失败，说明之前跑过已改为 654321，直接用新密码登录
  if (!token) {
    token = login(sid, HASH_654321);
  }

  if (!token) return;

  // 2. 改密码（幂等：如果已经是 654321，后端应该返回成功或失败都继续）
  changePassword(token, sid, HASH_123456, HASH_654321);

  // 3. 用新密码再登录一次
  token = login(sid, HASH_654321);
  if (!token) return;

  // 4. 获取书单
  const tbResult = getTextbooks(token);
  if (!tbResult) return;
  const textbooks = tbResult.textbooks_json || [];
  const tbCount = textbooks.length;
  if (tbCount === 0) return;

  // 5. 随机选书：随机确认/取消 1~3 本
  let bitmap = 0;
  const numChanges = randomIntBetween(1, Math.min(3, tbCount));
  const changedIndices = [];
  for (let i = 0; i < numChanges; i++) {
    const bookIdx = randomIntBetween(0, tbCount - 1);
    if (changedIndices.includes(bookIdx)) continue;
    changedIndices.push(bookIdx);
    if (Math.random() < 0.8) {
      bitmap = setBit(bitmap, bookIdx);
    } else {
      bitmap = clearBit(bitmap, bookIdx);
    }
  }

  // 6. 提交 bitmap
  submitBitmap(token, sid, bitmap);
}
