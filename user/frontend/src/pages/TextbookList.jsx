import { useState, useEffect } from 'react';
import { Card, Table, Checkbox, Button, Space, Typography, message, Spin, Statistic, Row, Col, Modal, Tag, Alert } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import api from '../api';

const { Title, Text } = Typography;

function TextbookList() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [textbooks, setTextbooks] = useState([]);
  const [bitmap, setBitmap] = useState(0n);
  const [studentInfo, setStudentInfo] = useState({});
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [confirmCooldown, setConfirmCooldown] = useState(0);
  const timerRef = useRef(null);
  const [cooldownOpen, setCooldownOpen] = useState(false);
  const [cooldownMsg, setCooldownMsg] = useState('');

  useEffect(() => {
    const info = JSON.parse(localStorage.getItem('student_info') || '{}');
    setStudentInfo(info);
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/student/textbooks');
      const data = res.data;
      if (!Array.isArray(data.textbooks_json)) {
        message.error('数据格式错误');
        return;
      }
      const list = data.textbooks_json.map((tb, index) => ({
        ...tb,
        index,
        checked: isBitSet(data.selection_bitmap, index),
      }));
      setTextbooks(list);
      setBitmap(BigInt(data.selection_bitmap));
      setIsConfirmed(data.is_confirmed);
    } catch (err) {
      message.error(err.response?.data?.error || '获取教材列表失败');
    } finally {
      setLoading(false);
    }
  };

  const isBitSet = (bitmapStr, index) => {
    const b = BigInt(bitmapStr);
    return ((b >> BigInt(index)) & 1n) === 1n;
  };

  const toggle = (index) => {
    if (isConfirmed) return;
    const newList = textbooks.map((tb, i) => {
      if (i === index) {
        return { ...tb, checked: !tb.checked };
      }
      return tb;
    });
    setTextbooks(newList);

    let b = bitmap;
    const pos = BigInt(index);
    if (newList[index].checked) {
      b = b | (1n << pos);
    } else {
      b = b & ~(1n << pos);
    }
    setBitmap(b);
  };

  const startCooldown = () => {
    setConfirmCooldown(10);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setConfirmCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopCooldown = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setConfirmCooldown(0);
  };

  const handleSubmit = () => {
    setConfirmOpen(true);
    startCooldown();
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    setSaving(true);
    try {
      await api.post('/student/bitmap', { new_bitmap: bitmap.toString() });
      message.success('提交成功');
      await fetchData();
    } catch (err) {
      if (err.response?.status === 429) {
        const sec = err.response.data.cooldown_seconds || 10;
        setCooldownMsg(`操作太频繁，请 ${sec} 秒后再试`);
        setCooldownOpen(true);
      } else if (err.response?.status === 403) {
        message.warning('已确认，不可重复提交');
        await fetchData();
      } else {
        message.error(err.response?.data?.error || '提交失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const openCancelModal = () => {
    setCancelModalOpen(true);
    startCooldown();
  };

  const handleCancelConfirm = async () => {
    setCancelModalOpen(false);
    setCancelling(true);
    try {
      await api.post('/student/cancel-confirm', {});
      message.success('已取消确认，10 秒后可重新选择');
      await fetchData();
    } catch (err) {
      if (err.response?.status === 429) {
        const sec = err.response.data.cooldown_seconds || 10;
        setCooldownMsg(`冷却期中，请 ${sec} 秒后再试`);
        setCooldownOpen(true);
      } else {
        message.error(err.response?.data?.error || '取消失败');
      }
    } finally {
      setCancelling(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/student/logout', {});
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('student_token');
    localStorage.removeItem('student_info');
    window.location.href = '/login';
  };

  const checkedCount = textbooks.filter((tb) => tb.checked).length;

  const columns = [
    { title: '教材名', dataIndex: 'name', key: 'name' },
    { title: 'ISBN', dataIndex: 'isbn', key: 'isbn' },
    { title: '出版社', dataIndex: 'publisher', key: 'publisher' },
    { title: '价格', dataIndex: 'price', key: 'price', render: (v) => v ? `¥${v}` : '-' },
    { title: '课程', dataIndex: 'course_name', key: 'course_name' },
    {
      title: '选订',
      key: 'select',
      align: 'center',
      width: 80,
      render: (_, record) => (
        <Checkbox
          checked={record.checked}
          onChange={() => toggle(record.index)}
          disabled={isConfirmed}
        />
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}>教材确认</Title>
          </Col>
          <Col flex="auto">
            <Space>
              <Text>学号：{studentInfo.student_id}</Text>
              <Text>姓名：{studentInfo.name}</Text>
              <Text>班级：{studentInfo.class_name}</Text>
            </Space>
          </Col>
          <Col>
            <Space>
              {isConfirmed && <Tag color="success">已确认</Tag>}
              <Statistic title="共" value={textbooks.length} suffix="种" />
              <Statistic title="已选" value={checkedCount} suffix="种" valueStyle={{ color: '#52c41a' }} />
              <Button icon={<LogoutOutlined />} onClick={handleLogout}>退出登录</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {isConfirmed && (
        <Alert
          message="选书结果已确认"
          description="如需修改，请点击下方「取消确认」按钮，10 秒冷却期后可重新选择。"
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {checkedCount > 0 && (
        <Card title="已选教材" style={{ marginBottom: 16 }}>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {textbooks.filter((tb) => tb.checked).map((tb) => (
              <li key={tb.textbook_id}>
                {tb.name}（{tb.course_name}）
                {tb.price && <Text type="secondary" style={{ marginLeft: 8 }}>¥{tb.price}</Text>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={textbooks}
            rowKey="textbook_id"
            pagination={false}
            bordered
          />
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            {!isConfirmed ? (
              <Button
                type="primary"
                size="large"
                loading={saving}
                onClick={handleSubmit}
              >
                提交并确认
              </Button>
            ) : (
              <Button
                size="large"
                loading={cancelling}
                onClick={openCancelModal}
              >
                取消确认
              </Button>
            )}
          </div>
        </Spin>
      </Card>

      <Modal
        title="确认提交"
        open={confirmOpen}
        onOk={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
        okText={confirmCooldown > 0 ? `确认提交 (${confirmCooldown}s)` : '确认提交'}
        cancelText="取消"
        confirmLoading={saving}
        okButtonProps={{ disabled: confirmCooldown > 0 }}
      >
        <p style={{ color: '#d48806', fontSize: 14, marginBottom: 8 }}>
          注意：因出版社再版、停印等原因，实际教材可能与征订不一致。
        </p>
        <p style={{ color: '#999', fontSize: 13 }}>
          如需修改，可点击"取消确认"，10 秒冷却期后可重新选择。
        </p>
      </Modal>

      <Modal
        title="取消确认"
        open={cancelModalOpen}
        onOk={handleCancelConfirm}
        onCancel={() => setCancelModalOpen(false)}
        okText={confirmCooldown > 0 ? `确认取消 (${confirmCooldown}s)` : '确认取消'}
        cancelText="关闭"
        confirmLoading={cancelling}
        okButtonProps={{ disabled: confirmCooldown > 0 }}
      >
        <p style={{ color: '#d48806', fontSize: 14, marginBottom: 8 }}>
          注意：取消确认后，之前的选书结果将失效，您需要重新选择。
        </p>
        <p style={{ color: '#999', fontSize: 13 }}>
          取消后需等待 10 秒冷却期，方可重新提交。
        </p>
      </Modal>

      <Modal
        title="操作太频繁"
        open={cooldownOpen}
        onOk={() => setCooldownOpen(false)}
        onCancel={() => setCooldownOpen(false)}
        okText="知道了"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <p>{cooldownMsg}</p>
      </Modal>
    </div>
  );
}

export default TextbookList;
