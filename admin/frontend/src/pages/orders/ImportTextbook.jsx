import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Card, Alert } from 'antd';
import { useCurrentOrder } from '../../contexts/CurrentOrderContext';
import TextbookImportForm from './TextbookImportForm';

const { Title, Text } = Typography;

function ImportTextbook() {
  const navigate = useNavigate();
  const { currentOrder, setCurrentOrder } = useCurrentOrder();
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!currentOrder) {
    return (
      <Alert
        message="请先选择订单"
        description="在「选择订单」页面中点击一个订单的「选择」或「详情」按钮，将其设为当前订单。"
        type="info"
        showIcon
      />
    );
  }

  const handleSuccess = () => {
    const newStatus = currentOrder?.status === 'roster_imported' ? 'imported' : 'textbook_imported';
    setCurrentOrder({ ...currentOrder, status: newStatus });
    timerRef.current = setTimeout(() => {
      navigate(`/orders/detail?id=${currentOrder.id}`);
    }, 1500);
  };

  return (
    <div>
      <Title level={3}>导入征订表</Title>
      <Text type="secondary">当前订单：{currentOrder.name}</Text>

      <Card style={{ marginTop: 16 }}>
        <TextbookImportForm orderId={currentOrder.id} onSuccess={handleSuccess} />
      </Card>
    </div>
  );
}

export default ImportTextbook;
