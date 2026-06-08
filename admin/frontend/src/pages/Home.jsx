import { useNavigate } from 'react-router-dom';
import { Card, Typography, Space } from 'antd';
import { FolderOpenOutlined, PlusOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

function Home() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', paddingTop: 80 }}>
      <Title level={3} style={{ textAlign: 'center', marginBottom: 48 }}>
        陕西新华教材报订系统
      </Title>

      <Space size="large" style={{ width: '100%', justifyContent: 'center' }}>
        <Card
          hoverable
          style={{ width: 280, textAlign: 'center' }}
          onClick={() => navigate('/orders/select')}
        >
          <FolderOpenOutlined style={{ fontSize: 48, color: '#1677ff', marginBottom: 16 }} />
          <Title level={4} style={{ marginTop: 0 }}>打开订单</Title>
          <Text type="secondary">查看和管理已有订单</Text>
        </Card>

        <Card
          hoverable
          style={{ width: 280, textAlign: 'center' }}
          onClick={() => navigate('/orders/new')}
        >
          <PlusOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
          <Title level={4} style={{ marginTop: 0 }}>新建订单</Title>
          <Text type="secondary">创建一个新的教材征订单</Text>
        </Card>
      </Space>
    </div>
  );
}

export default Home;
