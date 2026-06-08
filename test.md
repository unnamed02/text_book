# User 后端（Go）压力测试计划

## Context

User 后端（Go + Gin + pgx）已开发完成，提供三个 API：
- `POST /api/student/login` — 学号+密码登录（bcrypt 校验 + JWT 签发）
- `GET /api/student/textbooks` — 查教材（需 JWT，行级锁隔离）
- `POST /api/student/bitmap` — 更新选书 bitmap（需 JWT，UPDATE INT 字段）

需要验证其在并发场景下的表现，特别是 PostgreSQL 行级锁隔离不同学生记录的效果，以及 bcrypt 和 JWT 签发是否成为瓶颈。

## 环境现状

- 压测工具：系统未安装 wrk/k6/locust/hey/ab，但已安装 Docker
- 测试数据：admin 已下发征订单，数据库中有 student_accounts 和 class_textbooks 记录
- 后端地址：`http://localhost:8080`

## 方案：Docker + k6

k6 是专业负载测试工具，脚本用 JavaScript 编写，通过 Docker 运行无需本地安装。

### 1. 准备测试数据脚本

创建 `user/backend/scripts/prepare_tokens.js`：
- 从 PostgreSQL 读取一批学生账号（student_id + password）
- 调用 login API 批量获取 JWT token
- 将 token 列表写入 `user/backend/scripts/tokens.json`

### 2. 压测脚本

创建 `user/backend/scripts/stress_test.js`：
- 读取 tokens.json 中的 token 列表
- 对 `/api/student/textbooks` 和 `/api/student/bitmap` 进行并发请求
- 使用 k6 的 options 配置多种负载模式：
  - **Ramp-up**：10秒内从 0 增至 100 VU（虚拟用户）
  - **Sustained**：保持 100 VU 运行 60 秒
  - **Spike**：瞬间增至 500 VU 测试峰值承受能力

### 3. 监控指标

k6 原生输出：
- http_req_duration（P50/P95/P99）
- http_reqs（吞吐量，req/s）
- http_req_failed（错误率）
- 迭代次数、VU 数量

同时观察 Go 后端日志和 PostgreSQL 连接数：
```powershell
# 查看活跃连接
SELECT count(*) FROM pg_stat_activity WHERE datname = 'admin';
```

### 4. 执行命令

```powershell
cd "D:\Work\text_book\user\backend\scripts"

# 准备 token（Node.js 脚本）
node prepare_tokens.js

# 运行压测
docker run --rm -v "${PWD}:/scripts" -w /scripts grafana/k6 run stress_test.js
```

## 关键文件

| 文件 | 说明 |
|------|------|
| `user/backend/scripts/prepare_tokens.js` | 预先生成 JWT token 列表 |
| `user/backend/scripts/stress_test.js` | k6 压测主脚本 |
| `user/backend/scripts/tokens.json` | token 数据（gitignore） |

## 验证方式

1. 压测过程中 Go 后端不应崩溃，错误率 < 1%
2. P95 响应时间 < 200ms（UPDATE 一个 INT 字段应该很快）
3. PostgreSQL 中不同 student_id 的行级锁不互相阻塞
4. 压测结束后，数据一致性正常（bitmap 值正确写入）
