import { useState, useEffect, useCallback } from 'react';
import {
  Typography,
  Table,
  Tag,
  Button,
  Space,
  Popconfirm,
  message,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useCurrentOrder } from '../../contexts/CurrentOrderContext';
import api from '../../api';

const { Title, Text } = Typography;

const STATUS_MAP = {
  draft: { label: '草稿', color: 'default' },
  textbook_imported: { label: '征订表已导入', color: 'processing' },
  roster_imported: { label: '名单表已导入', color: 'processing' },
  imported: { label: '全部导入', color: 'success' },
  dispatched: { label: '已下发', color: 'purple' },
};

function SelectOrder() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const { currentOrder, setCurrentOrder } = useCurrentOrder();

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/orders');
      const data = await res.json();
      if (res.ok) {
        setOrders(data);
      } else {
        message.error(data.detail || '获取订单列表失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleDelete = async (id) => {
    try {
      const res = await api.del(`/api/orders/${id}`);
      if (res.ok) {
        message.success('删除成功');
        if (currentOrder && currentOrder.id === id) {
          setCurrentOrder(null);
        }
        fetchOrders();
      } else {
        const data = await res.json();
        message.error(data.detail || '删除失败');
      }
    } catch {
      message.error('网络错误');
    }
  };

  const handleSelect = (order) => {
    setCurrentOrder(order);
    message.success(`已选择订单：${order.name}`);
  };

  const handleDetail = (order) => {
    setCurrentOrder(order);
    navigate(`/orders/detail?id=${order.id}`);
  };

  const columns = [
    {
      title: '订单名称',
      dataIndex: 'name',
      key: 'name',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: '学校名称',
      dataIndex: 'school_name',
      key: 'school_name',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const cfg = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '教材',
      key: 'textbooks',
      render: (_, record) => record.stats?.textbooks ?? 0,
    },
    {
      title: '班级',
      key: 'classes',
      render: (_, record) => record.stats?.classes ?? 0,
    },
    {
      title: '征订记录',
      key: 'items',
      render: (_, record) => record.stats?.items ?? 0,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val) => (val ? new Date(val).toLocaleString() : '-'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button size="small" type={currentOrder && record.id === currentOrder.id ? 'primary' : 'default'} icon={<CheckCircleOutlined />} onClick={() => handleSelect(record)}>
            选择
          </Button>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleDetail(record)}>
            详情
          </Button>
          <Popconfirm
            title="确认删除"
            description="删除后无法恢复，是否继续？"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>选择订单</Title>
        <Button icon={<ReloadOutlined />} onClick={fetchOrders} loading={loading}>
          刷新
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={orders.map((o) => ({ ...o, key: o.id }))}
        loading={loading}
        rowClassName={(record) => (currentOrder && record.id === currentOrder.id ? 'ant-table-row-selected' : '')}
        pagination={{
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total) => `共 ${total} 条`,
          onShowSizeChange: (_, size) => setPageSize(size),
        }}
      />
    </div>
  );
}

export default SelectOrder;
