import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// 读取预生成的 token 列表
const tokens = new SharedArray('tokens', function () {
  return JSON.parse(open('./tokens.json'));
});

// 压测配置
export const options = {
  stages: [
    // 预热：10秒内从 0 增至 50 VU
    { duration: '10s', target: 50 },
    // 稳态：保持 100 VU 运行 60 秒
    { duration: '60s', target: 100 },
    // 峰值：瞬间增至 300 VU 测试峰值
    { duration: '10s', target: 300 },
    // 保持峰值 30 秒
    { duration: '30s', target: 300 },
    // 降级：10秒内降回 0
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // P95 响应时间 < 200ms
    http_req_failed: ['rate<0.01'],     // 错误率 < 1%
  },
};

// 随机选一个 token
function pickToken() {
  return tokens[randomIntBetween(0, tokens.length - 1)];
}

export default function () {
  const token = pickToken();
  const authHeaders = {
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
  };

  // 80% 概率查教材（读操作，主要流量）
  // 20% 概率更新 bitmap（写操作）
  const roll = Math.random();

  if (roll < 0.8) {
    // GET /api/student/textbooks
    const res = http.get(`${__ENV.API_BASE || 'http://host.docker.internal:8080'}/api/student/textbooks`, authHeaders);
    check(res, {
      'textbooks status is 200': (r) => r.status === 200,
      'textbooks response time < 200ms': (r) => r.timings.duration < 200,
    });
  } else {
    // POST /api/student/bitmap
    // 随机生成一个 bitmap（模拟学生勾选/取消教材）
    const newBitmap = randomIntBetween(0, 31);  // 假设最多5本教材
    const res = http.post(
      `${__ENV.API_BASE || 'http://host.docker.internal:8080'}/api/student/bitmap`,
      JSON.stringify({ new_bitmap: String(newBitmap) }),
      authHeaders
    );
    check(res, {
      'bitmap status is 200': (r) => r.status === 200,
      'bitmap response time < 200ms': (r) => r.timings.duration < 200,
    });
  }

  sleep(randomIntBetween(1, 3) / 10);  // 随机休息 100-300ms，模拟真实用户思考时间
}
