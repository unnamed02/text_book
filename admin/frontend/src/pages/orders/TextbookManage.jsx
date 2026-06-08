import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Table, Alert, message, Button, Modal, Form, Input, InputNumber } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useCurrentOrder } from '../../contexts/CurrentOrderContext';
import api from '../../api';

const { Title } = Typography;

function TextbookManage() {
  const navigate = useNavigate();
  const { currentOrder } = useCurrentOrder();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchData = () => {
    if (!currentOrder) return;
    setLoading(true);
    (async () => {
      try {
        const res = await api.get(`/api/orders/${currentOrder.id}/textbooks`);
        const d = await res.json();
        setData(d.map((r, i) => ({ ...r, key: i })));
      } catch {
        message.error('获取教材列表失败');
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(() => {
    fetchData();
  }, [currentOrder]);

  if (!currentOrder) {
    return (
      <Alert
        message="请先选择订单"
        description="在「选择订单」页面中点击一个订单的「选择」按钮，将其设为当前订单。"
        type="info"
        showIcon
      />
    );
  }

  const openEdit = (record) => {
    setEditingRecord(record);
    form.setFieldsValue({
      name: record.name,
      isbn: record.isbn || '',
      price: record.price || '',
      publisher: record.publisher || '',
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (values) => {
    if (!currentOrder || !editingRecord) return;
    setEditLoading(true);
    try {
      const res = await api.put(`/api/orders/${currentOrder.id}/textbooks/${editingRecord.id}`, values);
      const data = await res.json();
      if (res.ok) {
        message.success('教材已更新');
        setEditModalOpen(false);
        fetchData();
      } else {
        message.error(data.detail || '更新失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setEditLoading(false);
    }
  };

  const columns = [
    {
      title: '教材名',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <span
          style={{ cursor: 'pointer', color: '#1677ff' }}
          onClick={() => navigate(`/orders/textbook-detail/${record.id}`, { state: { tb: record } })}
        >
          {text}
        </span>
      ),
    },
    { title: 'ISBN', dataIndex: 'isbn', key: 'isbn' },
    { title: '价格', dataIndex: 'price', key: 'price' },
    { title: '出版社', dataIndex: 'publisher', key: 'publisher' },
    {
      title: '总理论用量',
      dataIndex: 'total_headcount',
      key: 'total_headcount',
      sorter: (a, b) => (a.total_headcount || 0) - (b.total_headcount || 0),
      defaultSortOrder: 'descend',
    },
    {
      title: '实际用量',
      dataIndex: 'actual_headcount',
      key: 'actual_headcount',
      sorter: (a, b) => (a.actual_headcount || 0) - (b.actual_headcount || 0),
      render: (v) => (v != null ? v : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
          编辑
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>教材管理</Title>
      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        pagination={{
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total) => `共 ${total} 条`,
          onShowSizeChange: (_, size) => setPageSize(size),
        }}
      />

      <Modal
        title="编辑教材"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={editLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item
            name="name"
            label="教材名"
            rules={[{ required: true, message: '请输入教材名' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="isbn" label="ISBN">
            <Input />
          </Form.Item>
          <Form.Item name="price" label="价格">
            <InputNumber style={{ width: '100%' }} precision={2} />
          </Form.Item>
          <Form.Item name="publisher" label="出版社">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default TextbookManage;
