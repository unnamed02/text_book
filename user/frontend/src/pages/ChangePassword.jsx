import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, message, Typography, Alert, Modal } from 'antd';
import api from '../api';

const { Title } = Typography;

// 前端预哈希：与后端 sha256Plain 保持一致
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function ChangePassword() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMsg, setModalMsg] = useState('');

  const handleSubmit = async (values) => {
    if (values.new_password !== values.confirm_password) {
      setModalMsg('两次输入的新密码不一致');
      setModalOpen(true);
      return;
    }
    setLoading(true);
    try {
      const oldPrehash = await sha256(values.old_password);
      const newPrehash = await sha256(values.new_password);
      await api.post('/student/change-password', {
        old_password: oldPrehash,
        new_password: newPrehash,
      });
      message.success('密码修改成功，请重新登录');
      localStorage.removeItem('student_token');
      localStorage.removeItem('student_info');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      const msg = err.response?.data?.error || '修改失败';
      setModalMsg(msg);
      setModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>修改密码</Title>
        <Alert
          message="首次登录需要修改初始密码"
          description="初始密码为 123456，为了账户安全，请设置新密码。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form onFinish={handleSubmit} layout="vertical">
          <Form.Item
            name="old_password"
            label="旧密码"
            rules={[{ required: true, message: '请输入旧密码' }]}
          >
            <Input.Password placeholder="请输入旧密码" />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6位' },
            ]}
          >
            <Input.Password placeholder="请设置新密码（至少6位）" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认新密码"
            rules={[{ required: true, message: '请再次输入新密码' }]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>确认修改</Button>
          </Form.Item>
        </Form>
      </Card>

      <Modal
        title="修改密码失败"
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

export default ChangePassword;
