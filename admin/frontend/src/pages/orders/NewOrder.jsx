import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, message, Typography, Card } from 'antd';
import { useCurrentOrder } from '../../contexts/CurrentOrderContext';
import api from '../../api';

const { Title } = Typography;

function NewOrder() {
  const navigate = useNavigate();
  const { setCurrentOrder } = useCurrentOrder();
  const [basicForm] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleCreateOrder = async (values) => {
    setLoading(true);
    try {
      const res = await api.post('/api/orders', values);
      const data = await res.json();
      if (res.ok) {
        setCurrentOrder(data);
        basicForm.resetFields();
        message.success('订单创建成功');
        navigate(`/orders/detail?id=${data.id}`);
      } else {
        message.error(data.detail || '创建失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Title level={3}>新建订单</Title>

      <Card>
        <Form form={basicForm} layout="vertical" onFinish={handleCreateOrder}>
          <Form.Item
            label="订单名称"
            name="name"
            rules={[{ required: true, message: '请输入订单名称' }]}
          >
            <Input placeholder="如：2026春安康学院征订单" />
          </Form.Item>
          <Form.Item
            label="学校名称"
            name="school_name"
            rules={[{ required: true, message: '请输入学校名称' }]}
          >
            <Input placeholder="如：安康学院" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              创建订单
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default NewOrder;
