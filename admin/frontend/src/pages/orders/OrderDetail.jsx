import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Button, Tag, Space, Typography, Alert, Statistic, Row, Col, Table, message, Spin, Divider,
  Input, Modal,
} from 'antd';
import {
  UploadOutlined, BookOutlined, TeamOutlined, ArrowLeftOutlined, CheckCircleOutlined,
  FileExcelOutlined, ExclamationCircleOutlined, SendOutlined,
  SearchOutlined, BarChartOutlined,
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

function OrderDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('id');
  const { currentOrder, setCurrentOrder } = useCurrentOrder();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [rosterCount, setRosterCount] = useState(0);
  const [textbooks, setTextbooks] = useState([]);
  const [dispatchStatus, setDispatchStatus] = useState(null);

  // 学生列表相关状态
  const [students, setStudents] = useState([]);
  const [studentLoading, setStudentLoading] = useState(false);
  const [resettingId, setResettingId] = useState(null);
  const [batchResetting, setBatchResetting] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  // 汇总统计状态
  const [summaryResult, setSummaryResult] = useState(null);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    if (orderId) {
      const controller = new AbortController();
      fetchOrder(orderId, controller.signal);
      return () => controller.abort();
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId && currentOrder) {
      setOrder(currentOrder);
      const controller = new AbortController();
      fetchRosterCount(currentOrder.id, controller.signal);
      fetchTextbooks(currentOrder.id, controller.signal);
      return () => controller.abort();
    }
  }, [orderId, currentOrder]);

  useEffect(() => {
    if (order) {
      const controller = new AbortController();
      fetchRosterCount(order.id, controller.signal);
      fetchTextbooks(order.id, controller.signal);
      if (order.status === 'dispatched') {
        fetchDispatchStatus(order.id, controller.signal);
        fetchStudents(order.id, controller.signal);
      }
      return () => controller.abort();
    }
  }, [order?.status]);

  const fetchOrder = async (id, signal) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/orders/${id}`, { signal });
      const data = await res.json();
      if (res.ok) {
        setOrder(data);
        setCurrentOrder(data);
      } else {
        message.error(data.detail || '获取订单详情失败');
      }
    } catch (err) {
      if (err.name !== 'AbortError') message.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const fetchRosterCount = async (id, signal) => {
    try {
      const res = await api.get(`/api/orders/${id}/rosters`, { signal });
      const data = await res.json();
      if (res.ok) {
        setRosterCount(data.length);
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error('获取花名册失败', err);
    }
  };

  const fetchTextbooks = async (id, signal) => {
    try {
      const res = await api.get(`/api/orders/${id}/textbooks`, { signal });
      const data = await res.json();
      if (res.ok) {
        setTextbooks(data.slice(0, 5));
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error('获取教材失败', err);
    }
  };

  const fetchDispatchStatus = async (id, signal) => {
    try {
      const res = await api.get(`/api/orders/${id}/dispatch-status`, { signal });
      const data = await res.json();
      if (res.ok) {
        setDispatchStatus(data);
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error('获取下发状态失败', err);
    }
  };

  const fetchStudents = async (id, signal) => {
    setStudentLoading(true);
    try {
      const res = await api.get(`/api/orders/${id}/students`, { signal });
      const data = await res.json();
      if (res.ok) {
        setStudents(data);
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error('获取学生列表失败', err);
    } finally {
      setStudentLoading(false);
    }
  };

  const handleDispatch = async () => {
    if (!order) return;
    setDispatching(true);
    try {
      const res = await api.post(`/api/orders/${order.id}/dispatch`);
      const data = await res.json();
      if (res.ok) {
        message.success(`下发成功：${data.student_count} 名学生、${data.class_count} 个班级`);
        setOrder({ ...order, status: 'dispatched' });
        setCurrentOrder({ ...order, status: 'dispatched' });
        fetchDispatchStatus(order.id);
      } else {
        message.error(data.detail || '下发失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setDispatching(false);
    }
  };

  const handleResetPassword = async (studentId) => {
    setResettingId(studentId);
    try {
      const res = await api.post(`/api/orders/${order.id}/students/${studentId}/reset-password`);
      const data = await res.json();
      if (res.ok) {
        message.success(`已重置：${studentId}`);
      } else {
        message.error(data.detail || '重置密码失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setResettingId(null);
    }
  };

  const handleBatchResetPassword = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择学生');
      return;
    }
    Modal.confirm({
      title: '批量重置密码确认',
      content: `确定要重置选中的 ${selectedRowKeys.length} 名学生的密码吗？密码将恢复为初始密码 123456。`,
      onOk: async () => {
        setBatchResetting(true);
        try {
          const res = await api.post(`/api/orders/${order.id}/students/reset-password-batch`, {
            student_ids: selectedRowKeys,
          });
          const data = await res.json();
          if (res.ok) {
            message.success(`已重置 ${data.reset_count} 名学生密码`);
            setSelectedRowKeys([]);
            const controller = new AbortController();
            fetchStudents(order.id, controller.signal);
          } else {
            message.error(data.detail || '批量重置密码失败');
          }
        } catch {
          message.error('网络错误');
        } finally {
          setBatchResetting(false);
        }
      },
    });
  };

  const handleSummary = async () => {
    if (!order) return;
    setSummarizing(true);
    try {
      const res = await api.post(`/api/orders/${order.id}/summary`);
      const data = await res.json();
      if (res.ok) {
        message.success(data.message);
        setSummaryResult(data);
        const controller = new AbortController();
        fetchStudents(order.id, controller.signal);
      } else {
        message.error(data.detail || '汇总失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setSummarizing(false);
    }
  };

  const isTextbookImported = order?.status === 'textbook_imported' || order?.status === 'imported' || order?.status === 'dispatched';
  const isRosterImported = order?.status === 'roster_imported' || order?.status === 'imported' || order?.status === 'dispatched';
  const canDispatch = order?.status === 'imported';
  const isDispatched = order?.status === 'dispatched';

  // 过滤学生列表
  const filteredStudents = students.filter((s) => {
    if (!searchText) return true;
    const text = searchText.toLowerCase();
    return (
      s.student_id.toLowerCase().includes(text) ||
      s.name.toLowerCase().includes(text) ||
      s.class_name.toLowerCase().includes(text)
    );
  });

  const studentColumns = [
    { title: '学号', dataIndex: 'student_id', key: 'student_id' },
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '班级', dataIndex: 'class_name', key: 'class_name' },
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

  const textbookColumns = [
    { title: '教材名', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: 'ISBN', dataIndex: 'isbn', key: 'isbn' },
    { title: '价格', dataIndex: 'price', key: 'price' },
    { title: '出版社', dataIndex: 'publisher', key: 'publisher', ellipsis: true },
  ];

  if (!order && !orderId && !currentOrder) {
    return (
      <Alert
        message="请先选择订单"
        description="在「选择订单」页面中点击一个订单的「选择」或「详情」按钮。"
        type="info"
        showIcon
      />
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin size="large" tip="加载订单中..." />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>{order?.name || '订单详情'}</Title>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/orders/select')}>
          返回订单列表
        </Button>
      </div>

      <Card size="small" style={{ marginBottom: 24 }}>
        <Space size="large" wrap>
          <Text><Text type="secondary">学校：</Text> {order?.school_name}</Text>
          <Text><Text type="secondary">状态：</Text>
            <Tag color={STATUS_MAP[order?.status]?.color}>{STATUS_MAP[order?.status]?.label}</Tag>
          </Text>
          <Text><Text type="secondary">创建时间：</Text> {order?.created_at ? new Date(order.created_at).toLocaleString() : '-'}</Text>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <BookOutlined />
                <span>征订表</span>
                {isTextbookImported && <Tag color="success">已导入</Tag>}
              </Space>
            }
            loading={loading}
          >
            {isTextbookImported ? (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Alert
                  message="征订表已导入"
                  description={`已导入 ${order?.stats?.textbooks ?? 0} 种教材、${order?.stats?.classes ?? 0} 个班级、${order?.stats?.items ?? 0} 条征订记录`}
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                />

                {textbooks.length > 0 && (
                  <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>教材预览（前5条）</Text>
                    <Table
                      columns={textbookColumns}
                      dataSource={textbooks.map((tb, idx) => ({ ...tb, key: idx }))}
                      size="small"
                      pagination={false}
                      bordered
                    />
                  </div>
                )}

                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={() => navigate('/orders/import-textbook')}
                >
                  重新上传征订表
                </Button>
              </Space>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size="middle" align="center">
                <Alert
                  message="尚未导入征订表"
                  description="请上传征订表Excel文件，包含教材和班级信息。"
                  type="info"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                  style={{ width: '100%' }}
                />
                <Button
                  type="primary"
                  size="large"
                  icon={<FileExcelOutlined />}
                  onClick={() => navigate('/orders/import-textbook')}
                >
                  上传征订表
                </Button>
              </Space>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <TeamOutlined />
                <span>名单表</span>
                {isRosterImported && <Tag color="success">已导入</Tag>}
              </Space>
            }
            loading={loading}
          >
            {isRosterImported ? (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Alert
                  message="名单表已导入"
                  description={`已导入 ${rosterCount} 条学生记录`}
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                />
                <Statistic title="学生记录数" value={rosterCount} />
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={() => navigate('/orders/import-roster')}
                >
                  重新上传名单表
                </Button>
              </Space>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size="middle" align="center">
                <Alert
                  message="尚未导入名单表"
                  description="请上传班级名单表Excel文件，包含学号、姓名和班级信息。"
                  type="info"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                  style={{ width: '100%' }}
                />
                <Button
                  type="primary"
                  size="large"
                  icon={<FileExcelOutlined />}
                  onClick={() => navigate('/orders/import-roster')}
                >
                  上传名单表
                </Button>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {(canDispatch || isDispatched) && (
        <>
          <Divider />
          <Card
            title={
              <Space>
                <SendOutlined />
                <span>征订单下发</span>
                {isDispatched && <Tag color="purple">已下发</Tag>}
              </Space>
            }
          >
            {canDispatch && (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Alert
                  message="准备下发征订单"
                  description="下发后将生成学生账号（初始密码 123456）和班级教材数据，学生端即可登录选书。"
                  type="info"
                  showIcon
                />
                <Button
                  type="primary"
                  size="large"
                  icon={<SendOutlined />}
                  loading={dispatching}
                  onClick={handleDispatch}
                >
                  下发征订单
                </Button>
              </Space>
            )}
            {isDispatched && dispatchStatus && (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Alert
                  message="征订单已下发"
                  description={`已创建 ${dispatchStatus.student_count} 个学生账号、${dispatchStatus.class_count} 个班级教材数据`}
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                />
                {dispatchStatus.dispatched_at && (
                  <Text type="secondary">
                    下发时间：{new Date(dispatchStatus.dispatched_at).toLocaleString()}
                  </Text>
                )}
              </Space>
            )}
          </Card>
        </>
      )}

      {/* 汇总统计 */}
      {isDispatched && (
        <>
          <Divider />
          <Card
            title={
              <Space>
                <BarChartOutlined />
                <span>汇总统计</span>
              </Space>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Alert
                message="汇总学生选书结果"
                description="点击按钮后，系统将通过 PostgreSQL 位运算解析所有学生的选书状态，统计各班级和教材的实际选择人数。"
                type="info"
                showIcon
              />
              <Button
                type="primary"
                size="large"
                icon={<BarChartOutlined />}
                loading={summarizing}
                onClick={handleSummary}
              >
                执行汇总
              </Button>
              {summaryResult && (
                <Row gutter={[16, 16]}>
                  <Col xs={12} sm={6}>
                    <Statistic title="总学生数" value={summaryResult.total_students} suffix="人" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="已选书" value={summaryResult.confirmed_students} suffix="人" valueStyle={{ color: '#52c41a' }} />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="理论总用量" value={summaryResult.total_headcount} suffix="本" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="实际总用量" value={summaryResult.total_actual} suffix="本" valueStyle={{ color: '#1677ff' }} />
                  </Col>
                </Row>
              )}
            </Space>
          </Card>
        </>
      )}

      {/* 学生选书情况 */}
      {isDispatched && (
        <>
          <Divider />
          <Card
            title={
              <Space>
                <TeamOutlined />
                <span>学生选书情况</span>
                <Tag color="blue">共 {students.length} 人</Tag>
              </Space>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Row gutter={[16, 16]} align="middle">
                <Col flex="auto">
                  <Input
                    placeholder="搜索学号、姓名或班级"
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                  />
                </Col>
                <Col>
                  <Button
                    danger
                    loading={batchResetting}
                    disabled={selectedRowKeys.length === 0}
                    onClick={handleBatchResetPassword}
                  >
                    批量重置密码 ({selectedRowKeys.length})
                  </Button>
                </Col>
              </Row>

              <Table
                rowSelection={{
                  selectedRowKeys,
                  onChange: setSelectedRowKeys,
                }}
                columns={studentColumns}
                dataSource={filteredStudents.map((s) => ({ ...s, key: s.student_id }))}
                loading={studentLoading}
                size="small"
                pagination={{ pageSize: 20 }}
                bordered
              />
            </Space>
          </Card>
        </>
      )}
    </div>
  );
}

export default OrderDetail;
