import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Typography, Table, Button, Tag, Spin, Alert, Card, Space, Descriptions, message,
  Row, Col, Statistic, Divider,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useCurrentOrder } from '../../contexts/CurrentOrderContext';
import api from '../../api';

const { Title } = Typography;

function ClassDetail() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentOrder } = useCurrentOrder();

  const classInfo = location.state?.cls || null;

  const [items, setItems] = useState([]);
  const [rosters, setRosters] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [itemPageSize, setItemPageSize] = useState(10);
  const [studentPageSize, setStudentPageSize] = useState(10);
  const [resettingId, setResettingId] = useState(null);
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);

  useEffect(() => {
    if (!currentOrder || !classId) return;
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [currentOrder, classId, classInfo?.class_name]);

  const fetchData = (signal) => {
    setLoading(true);

    Promise.all([
      api.get(`/api/orders/${currentOrder.id}/items?class_id=${classId}`, { signal }).then((res) => res.json()),
      api.get(`/api/orders/${currentOrder.id}/rosters?class_id=${classId}`, { signal }).then((res) => res.json()),
      api.get(`/api/orders/${currentOrder.id}/students`, { signal }).then((res) => res.json()),
    ])
      .then(([itemsData, rostersData, studentsData]) => {
        setItems(itemsData.map((r, i) => ({ ...r, key: i })));
        setRosters(rostersData.map((r, i) => ({ ...r, key: i })));
        const classStudents = studentsData.filter((s) => s.class_name === classInfo?.class_name);
        setStudents(classStudents.map((s) => ({ ...s, key: s.student_id })));
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          message.error('获取数据失败');
        }
      })
      .finally(() => setLoading(false));
  };

  const handleResetPassword = async (studentId) => {
    setResettingId(studentId);
    try {
      const res = await api.post(`/api/orders/${currentOrder.id}/students/${studentId}/reset-password`);
      const data = await res.json();
      if (res.ok) {
        message.success(`已重置密码：${studentId}`);
      } else {
        message.error(data.detail || '重置密码失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setResettingId(null);
    }
  };

  const toggleExpand = (studentId) => {
    setExpandedRowKeys((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const getStudentBooks = (student) => {
    const bitmap = BigInt(student.selection_bitmap || 0);
    return items
      .filter((_, idx) => ((bitmap >> BigInt(idx)) & 1n) === 1n)
      .map((it, i) => ({ ...it, key: i }));
  };

  const itemActualCounts = useMemo(() => {
    const counts = new Map();
    for (const item of items) {
      const bitPos = item.key;
      let count = 0;
      for (const s of students) {
        if (((BigInt(s.selection_bitmap || 0) >> BigInt(bitPos)) & 1n) === 1n) {
          count++;
        }
      }
      counts.set(item.key, count);
    }
    return counts;
  }, [items, students]);

  const getItemActualCount = (item) => itemActualCounts.get(item.key) || 0;

  const countStudentBooks = (bitmap) => {
    let n = BigInt(bitmap || 0);
    let count = 0;
    while (n > 0n) {
      count++;
      n &= n - 1n;
    }
    return count;
  };

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

  const itemColumns = [
    { title: '课程名', dataIndex: 'course_name', key: 'course_name', render: (v) => v || '-' },
    {
      title: '教材',
      key: 'textbook',
      render: (_, record) => record.textbook?.name,
    },
    {
      title: 'ISBN',
      key: 'isbn',
      render: (_, record) => record.textbook?.isbn,
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
      render: (_, record) => {
        const count = getItemActualCount(record);
        return (
          <Tag color={count > 0 ? 'success' : 'default'}>
            {count} 人
          </Tag>
        );
      },
    },
  ];

  const studentColumns = [
    { title: '学号', dataIndex: 'student_id', key: 'student_id' },
    { title: '姓名', dataIndex: 'name', key: 'name' },
    {
      title: '已选教材',
      key: 'confirmed_count',
      width: 200,
      render: (_, record) => {
        const isExpanded = expandedRowKeys.includes(record.student_id);
        const books = isExpanded ? getStudentBooks(record) : [];
        const bookCount = countStudentBooks(record.selection_bitmap);
        return (
          <div>
            {bookCount > 0 ? (
              <Button
                type="link"
                size="small"
                onClick={() => toggleExpand(record.student_id)}
                style={{ paddingLeft: 0 }}
              >
                {bookCount} 本（{isExpanded ? '收起' : '展开'}）
              </Button>
            ) : (
              <span style={{ color: '#999' }}>0 本</span>
            )}
            {isExpanded && books.length > 0 && (
              <ul style={{ margin: '4px 0 0 0', paddingLeft: 16, color: '#333' }}>
                {books.map((book) => (
                  <li key={book.key}>{book.textbook?.name || '-'}</li>
                ))}
              </ul>
            )}
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Button
          size="small"
          loading={resettingId === record.student_id}
          onClick={() => handleResetPassword(record.student_id)}
        >
          重置密码
        </Button>
      ),
    },
  ];

  const firstMapping = classInfo?.mappings?.[0];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/orders/classes')}>
          返回班级列表
        </Button>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions title={classInfo?.class_name || `班级 #${classId}`} column={4} size="small">
          <Descriptions.Item label="校区">{firstMapping?.campus || '-'}</Descriptions.Item>
          <Descriptions.Item label="学院">{firstMapping?.college || '-'}</Descriptions.Item>
          <Descriptions.Item label="专业">{firstMapping?.major || '-'}</Descriptions.Item>
          <Descriptions.Item label="理论人数">
            {classInfo?.headcount != null ? `${classInfo.headcount} 人` : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Statistic title="总人数" value={rosters.length} suffix="人" />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title="已选书" value={students.length} suffix="人" valueStyle={{ color: '#52c41a' }} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title="教材种数" value={items.length} suffix="种" />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="实际总选择"
            value={items.reduce((sum, it) => sum + getItemActualCount(it), 0)}
            suffix="本"
            valueStyle={{ color: '#1677ff' }}
          />
        </Col>
      </Row>

      <Divider />

      <Title level={4}>教材选择统计 ({items.length} 种)</Title>
      {loading ? (
        <Spin />
      ) : (
        <Table
          columns={itemColumns}
          dataSource={items}
          size="small"
          rowKey="key"
          pagination={{
            pageSize: itemPageSize,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `共 ${total} 条`,
            onShowSizeChange: (_, size) => setItemPageSize(size),
          }}
        />
      )}

      <Title level={4} style={{ marginTop: 32 }}>个人选书情况 ({students.length} 人)</Title>
      {loading ? (
        <Spin />
      ) : (
        <Table
          columns={studentColumns}
          dataSource={students}
          size="small"
          rowKey="student_id"
          pagination={{
            pageSize: studentPageSize,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `共 ${total} 条`,
            onShowSizeChange: (_, size) => setStudentPageSize(size),
          }}
        />
      )}

    </div>
  );
}

export default ClassDetail;
