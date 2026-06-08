import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Tree, Alert, Spin, Tag, message } from 'antd';
import { useCurrentOrder } from '../../contexts/CurrentOrderContext';
import api from '../../api';

const { Title, Text } = Typography;

function ClassManage() {
  const navigate = useNavigate();
  const { currentOrder } = useCurrentOrder();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentOrder) return;
    setLoading(true);
    (async () => {
      try {
        const res = await api.get(`/api/orders/${currentOrder.id}/classes`);
        const d = await res.json();
        setData(d);
      } catch {
        message.error('获取班级列表失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [currentOrder]);

  const treeData = useMemo(() => {
    const tree = {};
    for (const cls of data) {
      const mappings = cls.mappings || [];
      if (mappings.length === 0) {
        const campus = '未分类校区';
        const college = '未分类学院';
        if (!tree[campus]) tree[campus] = {};
        if (!tree[campus][college]) tree[campus][college] = [];
        tree[campus][college].push(cls);
        continue;
      }
      for (const m of mappings) {
        const campus = m.campus || '未分类校区';
        const college = m.college || '未分类学院';
        if (!tree[campus]) tree[campus] = {};
        if (!tree[campus][college]) tree[campus][college] = [];
        tree[campus][college].push({ ...cls, _major: m.major });
      }
    }

    return Object.entries(tree).map(([campus, colleges]) => ({
      title: (
        <span>
          <Text strong>{campus}</Text>
          <Tag size="small" style={{ marginLeft: 8 }}>
            {Object.values(colleges).flat().length} 个班级
          </Tag>
        </span>
      ),
      key: `campus-${campus}`,
      children: Object.entries(colleges).map(([college, classes]) => ({
        title: (
          <span>
            <Text strong>{college}</Text>
            <Tag size="small" style={{ marginLeft: 8 }}>{classes.length} 个班级</Tag>
          </span>
        ),
        key: `college-${campus}-${college}`,
        children: classes.map((cls) => ({
          title: (
            <span
              style={{ cursor: 'pointer', color: '#1677ff' }}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/orders/class-detail/${cls.id}`, { state: { cls } });
              }}
            >
              {cls.class_name}
              {cls._major && <Text type="secondary" style={{ marginLeft: 8 }}>{cls._major}</Text>}
              <Tag size="small" color="blue" style={{ marginLeft: 8 }}>
                {cls.textbook_count || 0} 种教材
              </Tag>
              <Tag size="small" color="green" style={{ marginLeft: 4 }}>
                {cls.roster_count || 0} 人
              </Tag>
              <Tag size="small" color="purple" style={{ marginLeft: 4 }}>
                {cls.confirmed_count != null ? `${cls.confirmed_count} 人已确认` : '未汇总'}
              </Tag>
            </span>
          ),
          key: `class-${cls.id}`,
          isLeaf: true,
        })),
      })),
    }));
  }, [data, navigate]);

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

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>班级管理</Title>
      {loading ? (
        <Spin />
      ) : (
        <Tree
          treeData={treeData}
          defaultExpandedKeys={treeData.map((n) => n.key)}
          showLine
          showIcon={false}
        />
      )}
    </div>
  );
}

export default ClassManage;
