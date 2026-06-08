import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('username', values.username);
      params.append('password', values.password);

      const res = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = await res.json();
      if (res.ok) {
        message.success('登录成功');
        localStorage.setItem('token', data.access_token);
        navigate('/');
      } else {
        message.error(data.detail || '登录失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      {/* 左侧：背景图 + 品牌信息 */}
      <div
        style={{
          flex: '1 1 70%',
          position: 'relative',
          backgroundImage: 'url(/xh.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 80px',
        }}
      >
        {/* 蓝色遮罩 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(22, 119, 255, 0.70)',
            backdropFilter: 'blur(4px)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1, color: '#fff' }}>
          <Title style={{ color: '#fff', fontSize: 42, marginBottom: 16 }}>
            陕西新华教材报订系统
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.90)', fontSize: 18 }}>
            高效、便捷的教材报订管理平台
          </Text>
        </div>
      </div>

      {/* 右侧：登录表单 */}
      <div
        style={{
          flex: '1 1 30%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#fff',
          padding: '0 60px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ marginBottom: 40 }}>
            <Title level={3} style={{ margin: '0 0 8px' }}>
              欢迎登录
            </Title>
            <Text type="secondary">请输入您的账号密码进入系统</Text>
          </div>

          <Form
            name="login"
            onFinish={onFinish}
            autoComplete="off"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="用户名"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
              />
            </Form.Item>

            <Form.Item style={{ marginTop: 24 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{ borderRadius: 8, height: 44 }}
              >
                登 录
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  );
}

export default Login;
