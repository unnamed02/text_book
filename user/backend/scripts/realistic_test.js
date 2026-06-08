import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
function randomIntBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
import exec from 'k6/execution';
import crypto from 'k6/crypto';

const studentsJson = open('./students.json');
if (!studentsJson) {
  throw new Error('students.json not found. Make sure to mount it in Docker: -v $(pwd):/scripts');
}
const students = JSON.parse(studentsJson);
const totalStudents = 100;

export const options = {
  scenarios: {
    realistic: {
      executor: 'shared-iterations',
      vus: 10,              // 1000 并发
      iterations: totalStudents, // 8000 次迭代，每个学生一次
      maxDuration: '5m',
    },
  },
};

const apiBase = __ENV.API_BASE || 'http://101.37.238.186';

function sha256(text) {
  const hash = crypto.sha256(text, 'hex');
  return hash;
}

function setBit(bitmap, idx) {
  return bitmap | (1 << idx);
}
function clearBit(bitmap, idx) {
  return bitmap & ~(1 << idx);
}

// 每次迭代的总流量（字节）
const iterationBandwidth = new Trend('iteration_bandwidth_bytes');

function login(student_id, password) {
  const prehash = sha256(password);
  const body = JSON.stringify({ student_id, password: prehash });
  const res = http.post(
    `${apiBase}/api/student/login`,
    body,
    { headers: { 'Content-Type': 'application/json' } }
  );
  const bytes = body.length + (res.body ? res.body.length : 0);
  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
  });
  if (!ok) {
    console.error(`LOG|LOGIN_FAIL|${student_id}|${res.status}|${res.body}`);
    return { token: null, bytes };
  }
  return { token: res.json('token'), bytes };
}

function getTextbooks(token, sid) {
  const res = http.get(`${apiBase}/api/student/textbooks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const bytes = res.body ? res.body.length : 0;
  const ok = check(res, {
    'textbooks status 200': (r) => r.status === 200,
  });
  if (!ok) {
    console.error(`LOG|TEXTBOOKS_FAIL|${sid}|${res.status}`);
    return { data: null, bytes };
  }
  return { data: res.json(), bytes };
}

function changePassword(token, sid, oldPassword, newPassword) {
  const oldPrehash = sha256(oldPassword);
  const newPrehash = sha256(newPassword);
  const body = JSON.stringify({ old_password: oldPrehash, new_password: newPrehash });
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
  const bytes = body.length + (res.body ? res.body.length : 0);
  const ok = check(res, {
    'change-password status 200': (r) => r.status === 200,
  });
  if (!ok) {
    console.error(`LOG|CHANGE_PWD_FAIL|${sid}|${res.status}|${res.body}`);
    return { ok: false, bytes };
  }
  console.log(`LOG|CHANGE_PWD|${sid}|OK`);
  return { ok: true, bytes };
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
  const bytes = body.length + (res.body ? res.body.length : 0);
  const ok = check(res, {
    'bitmap submit status 200': (r) => r.status === 200,
  });
  console.log(`LOG|SUBMIT|${sid}|bitmap=${bitmap}|status=${res.status}`);
  return { ok, bytes };
}

export default function () {
  let iterationBytes = 0;

  const idx = exec.scenario.iterationInTest % totalStudents;
  const student = students[idx];
  const sid = student.student_id;
  const defaultPassword = '123456';
  const newPassword = '654321';

  // ---- 1. 首次登录（默认密码） ----
  const login1 = login(sid, defaultPassword);
  if (!login1.token) return;
  iterationBytes += login1.bytes;
  console.log(`LOG|LOGIN_1|${sid}|OK`);

  // ---- 2. 查教材 ----
  const tbResult = getTextbooks(login1.token, sid);
  if (!tbResult.data) return;
  iterationBytes += tbResult.bytes;
  const textbooks = tbResult.data.textbooks_json || [];
  const tbCount = textbooks.length;
  console.log(`LOG|TEXTBOOKS|${sid}|count=${tbCount}`);
  if (tbCount === 0) {
    console.log(`LOG|NO_BOOKS|${sid}|SKIP`);
    return;
  }

  // ---- 3. 修改密码 ----
  sleep(randomIntBetween(1, 3));
  const pwdResult = changePassword(login1.token, sid, defaultPassword, newPassword);
  if (!pwdResult.ok) return;
  iterationBytes += pwdResult.bytes;

  // ---- 4. 重新登录（新密码） ----
  sleep(randomIntBetween(1, 3));
  const login2 = login(sid, newPassword);
  if (!login2.token) return;
  iterationBytes += login2.bytes;
  console.log(`LOG|LOGIN_2|${sid}|OK`);

  // ---- 5. 模拟选书：随机确认/取消 1~3 本 ----
  let bitmap = 0;
  const numChanges = randomIntBetween(1, Math.min(3, tbCount));
  const changedIndices = [];
  for (let i = 0; i < numChanges; i++) {
    const idx = randomIntBetween(0, tbCount - 1);
    if (changedIndices.includes(idx)) continue;
    changedIndices.push(idx);
    if (Math.random() < 0.8) {
      bitmap = setBit(bitmap, idx);
    } else {
      bitmap = clearBit(bitmap, idx);
    }
  }
  console.log(`LOG|SELECT|${sid}|bitmap=${bitmap}|changed=${changedIndices.join(',')}`);

  // ---- 6. 提交 bitmap（只提交一次，确认后不可再改） ----
  sleep(randomIntBetween(1, 3));
  const submitResult = submitBitmap(login2.token, sid, bitmap);
  iterationBytes += submitResult.bytes;

  if (submitResult.ok) {
    console.log(`LOG|DONE|${sid}|final_bitmap=${bitmap}`);
  } else {
    console.error(`LOG|DONE|${sid}|FAIL`);
  }

  // 记录本次迭代的总带宽（字节）
  iterationBandwidth.add(iterationBytes);
  console.log(`LOG|BANDWIDTH|${sid}|${iterationBytes} bytes`);
}
