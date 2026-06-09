import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, message, Typography, Modal } from 'antd';
import api from '../api';
import { hashSha256 } from '../utils/sha256';

const { Title, Text } = Typography;

function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMsg, setModalMsg] = useState('');

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const prehash = hashSha256(values.password);
      const res = await api.post('/student/login', {
        student_id: values.student_id,
        password: prehash,
      });
      localStorage.setItem('student_token', res.data.token);
      localStorage.setItem('student_info', JSON.stringify({
        student_id: res.data.student_id,
        name: res.data.name,
        class_name: res.data.class_name,
      }));

      if (res.data.need_change_password) {
        message.warning('首次登录，请先修改密码');
        navigate('/change-password');
      } else {
        message.success('登录成功');
        navigate('/');
      }
    } catch (err) {
      const msg = err.response?.data?.error || '登录失败';
      setModalMsg(msg);
      setModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 360 }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>学生选书系统</Title>

        <Form onFinish={handleSubmit} layout="vertical">
          <Form.Item name="student_id" label="学号" rules={[{ required: true, message: '请输入学号' }]}>
            <Input placeholder="请输入学号" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="初始密码 123456" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>登录</Button>
          </Form.Item>
        </Form>

        <Text type="secondary" style={{ fontSize: 12 }}>
          提示：连续输错 5 次密码将锁定账号 15 分钟
        </Text>
      </Card>

      <Modal
        title="登录失败"
        open={modalOpen}
        onOk={() => setModalOpen(false)}
        onCancel={() => setModalOpen(false)}
        okText="确定"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <p>{modalMsg}</p>
      </Modal>
    </div>
  );
}

export default Login;
