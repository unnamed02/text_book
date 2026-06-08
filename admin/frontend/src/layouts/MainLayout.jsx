import { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Menu, Layout, Typography, Button, Tag } from 'antd';
import {
  FileTextOutlined,
  PlusCircleOutlined,
  UnorderedListOutlined,
  LogoutOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  TeamOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { useCurrentOrder } from '../contexts/CurrentOrderContext';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

const STATUS_MAP = {
  draft: { label: '草稿', color: 'default' },
  textbook_imported: { label: '征订表已导入', color: 'processing' },
  roster_imported: { label: '名单表已导入', color: 'processing' },
  imported: { label: '全部导入', color: 'success' },
  dispatched: { label: '已下发', color: 'purple' },
};

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState(['orders']);
  const { currentOrder } = useCurrentOrder();

  const menuItems = [
    {
      key: 'orders',
      icon: <FileTextOutlined />,
      label: '订单管理',
      children: [
        {
          key: '/orders/select',
          icon: <UnorderedListOutlined />,
          label: '选择订单',
        },
        {
          key: '/orders/new',
          icon: <PlusCircleOutlined />,
          label: '新建订单',
        },
      ],
    },
    {
      key: '/orders/classes',
      icon: <TeamOutlined />,
      label: '班级管理',
    },
    {
      key: '/orders/textbooks',
      icon: <BookOutlined />,
      label: '教材管理',
    },
  ];

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  const handleOpenChange = (keys) => {
    setOpenKeys(keys);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
    } catch (e) {
      // ignore network errors
    }
    localStorage.removeItem('token');
    navigate('/login');
  };

  const selectedKeys = [location.pathname];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width="20%"
        collapsed={collapsed}
        collapsedWidth={0}
        trigger={null}
        style={{
          minWidth: collapsed ? 0 : 200,
          maxWidth: collapsed ? 0 : 280,
          background: '#fff',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Title level={4} style={{ color: '#1677ff', margin: 0, fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            陕西新华教材报订系统
          </Title>
        </div>

        {currentOrder && (
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #f0f0f0',
              background: '#fafafa',
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>当前订单</Text>
            <div
              style={{
                marginTop: 4,
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              onClick={() => navigate('/orders/select')}
              title={currentOrder.name}
            >
              {currentOrder.name}
            </div>
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{currentOrder.school_name}</Text>
              {(() => {
                const cfg = STATUS_MAP[currentOrder.status] || { label: currentOrder.status, color: 'default' };
                return <Tag size="small" color={cfg.color}>{cfg.label}</Tag>;
              })()}
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Menu
            theme="light"
            mode="inline"
            inlineCollapsed={collapsed}
            selectedKeys={selectedKeys}
            openKeys={collapsed ? [] : openKeys}
            items={menuItems}
            onClick={handleMenuClick}
            onOpenChange={handleOpenChange}
            style={{
              borderRight: 0,
              background: 'transparent',
            }}
          />
        </div>

        <div
          style={{
            padding: '16px',
            borderTop: '1px solid #f0f0f0',
          }}
        >
          <Button
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            style={{ width: '100%', borderColor: '#d9d9d9', color: '#595959' }}
          >
            退出登录
          </Button>
        </div>
      </Sider>

      <div
        style={{
          position: 'fixed',
          left: collapsed ? 0 : '20%',
          marginLeft: -9,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10,
        }}
      >
        <Button
          icon={collapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: '#fff',
            border: '1px solid #e8e8e8',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            color: '#595959',
            width: 18,
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            borderRadius: 4,
          }}
        />
      </div>

      <Layout style={{ background: '#f5f5f5' }}>
        <Content
          style={{
            margin: 24,
            padding: 24,
            background: '#fff',
            borderRadius: 8,
            minHeight: 280,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default MainLayout;
