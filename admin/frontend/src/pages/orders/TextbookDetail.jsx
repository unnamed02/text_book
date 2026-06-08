import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Typography, Table, Button, Tag, Spin, Alert, Card, Space, Descriptions, message,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useCurrentOrder } from '../../contexts/CurrentOrderContext';
import api from '../../api';

const { Title } = Typography;

function TextbookDetail() {
  const { textbookId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentOrder } = useCurrentOrder();

  const textbookInfo = location.state?.tb || null;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (!currentOrder || !textbookId) return;
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const res = await api.get(`/api/orders/${currentOrder.id}/items?textbook_id=${textbookId}`, {
          signal: controller.signal,
        });
        const d = await res.json();
        setItems(d.map((r, i) => ({ ...r, key: i })));
      } catch (err) {
        if (err.name !== 'AbortError') message.error('获取使用班级失败');
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [currentOrder, textbookId]);

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

  const columns = [
    {
      title: '班级',
      key: 'class',
      render: (_, record) => record.class?.class_name,
    },
    {
      title: '课程名',
      dataIndex: 'course_name',
      key: 'course_name',
      render: (v) => v || '-',
    },
    {
      title: '理论人数',
      key: 'headcount',
      render: (_, record) =>
        record.class?.headcount != null ? `${record.class.headcount} 人` : '-',
    },
    {
      title: '实际选择',
      key: 'actual_count',
      render: (_, record) => (
        record.actual_count != null ? (
          <Tag color={record.actual_count > 0 ? 'success' : 'default'}>
            {record.actual_count} 人
          </Tag>
        ) : (
          <Tag color="default">未汇总</Tag>
        )
      ),
    },
    {
      title: '确认比例',
      key: 'ratio',
      render: (_, record) => {
        const headcount = record.class?.headcount;
        const actual = record.actual_count;
        if (headcount && actual != null && headcount > 0) {
          const ratio = ((actual / headcount) * 100).toFixed(1);
          return `${ratio}%`;
        }
        return '-';
      },
    },
  ];

  const totalActual = items.reduce((sum, it) => sum + (it.actual_count || 0), 0);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/orders/textbooks')}>
          返回教材列表
        </Button>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions title={textbookInfo?.name || `教材 #${textbookId}`} column={4} size="small">
          <Descriptions.Item label="ISBN">{textbookInfo?.isbn || '-'}</Descriptions.Item>
          <Descriptions.Item label="出版社">{textbookInfo?.publisher || '-'}</Descriptions.Item>
          <Descriptions.Item label="价格">{textbookInfo?.price || '-'}</Descriptions.Item>
          <Descriptions.Item label="总理论用量">{textbookInfo?.total_headcount ?? '-'}</Descriptions.Item>
        </Descriptions>
        <Descriptions column={4} size="small" style={{ marginTop: 8 }}>
          <Descriptions.Item label="实际总用量">
            <Tag color="blue">{textbookInfo?.actual_headcount ?? '-'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="使用班级数">{items.length} 个</Descriptions.Item>
          <Descriptions.Item label="汇总后实际总量">{totalActual} 人</Descriptions.Item>
        </Descriptions>
      </Card>

      <Title level={4}>使用班级 ({items.length} 个)</Title>
      {loading ? (
        <Spin />
      ) : (
        <Table
          columns={columns}
          dataSource={items}
          size="small"
          pagination={{
            pageSize,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `共 ${total} 条`,
            onShowSizeChange: (_, size) => setPageSize(size),
          }}
        />
      )}
    </div>
  );
}

export default TextbookDetail;
