import { useState } from 'react';
import {
  Upload, Button, Table, Select, message, Typography, Space, Divider, Alert,
} from 'antd';
import { UploadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../../api';

const { Text } = Typography;
const { Option } = Select;

const TARGET_FIELDS = [
  { key: '学号', label: '学号', required: true },
  { key: '姓名', label: '姓名', required: true },
  { key: '班级', label: '班级', required: true },
];

function RosterImportForm({ orderId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [previewData, setPreviewData] = useState([]);
  const [columnConfigs, setColumnConfigs] = useState({});
  const [importResult, setImportResult] = useState(null);

  const handleUpload = async ({ file }) => {
    setExcelFile(file);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post(`/api/orders/${orderId}/rosters/preview`, formData);
      const data = await res.json();
      if (res.ok) {
        setColumns(data.columns);
        setPreviewData(data.preview);

        const initConfigs = {};
        data.columns.forEach((col) => {
          initConfigs[col] = { targetField: null };
        });
        Object.entries(data.suggestions || {}).forEach(([fieldKey, colName]) => {
          if (initConfigs[colName]) {
            initConfigs[colName].targetField = fieldKey;
          }
        });
        setColumnConfigs(initConfigs);
      } else {
        message.error(data.detail || '预览失败');
      }
    } catch {
      message.error('网络错误');
    }
  };

  const handleImport = async () => {
    const mapping = {};
    Object.entries(columnConfigs).forEach(([col, cfg]) => {
      if (cfg.targetField) {
        mapping[cfg.targetField] = { col };
      }
    });

    const missing = TARGET_FIELDS.filter(
      (f) => f.required && (!mapping[f.key] || !mapping[f.key].col)
    );
    if (missing.length > 0) {
      message.error(`缺少必填字段映射: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', excelFile);
    formData.append('mapping', JSON.stringify(mapping));

    try {
      const res = await api.post(`/api/orders/${orderId}/rosters/import`, formData);
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        message.success('名单表导入成功');
        if (onSuccess) onSuccess(data);
      } else {
        message.error(data.detail || '导入失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setExcelFile(null);
    setColumns([]);
    setPreviewData([]);
    setColumnConfigs({});
    setImportResult(null);
  };

  const previewTableCols = columns.map((c) => ({
    title: <Text strong>{c}</Text>,
    dataIndex: c,
    key: c,
  }));

  const previewTableData = previewData.map((row, idx) => {
    const obj = { key: idx };
    columns.forEach((c, i) => (obj[c] = row[i]));
    return obj;
  });

  if (importResult) {
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert
          message={`成功导入 ${importResult.inserted} 条学生记录`}
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
        />
        {importResult.warnings?.length > 0 && (
          <Alert
            message="警告"
            description={
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {importResult.warnings.map((w, i) => (<li key={i}>{w}</li>))}
              </ul>
            }
            type="warning"
          />
        )}
        <Button onClick={handleReset}>继续上传</Button>
      </Space>
    );
  }

  if (!columns.length) {
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Upload beforeUpload={() => false} onChange={handleUpload} maxCount={1} accept=".xlsx">
          <Button icon={<UploadOutlined />}>上传班级名单表（Excel）</Button>
        </Upload>
        <Text type="secondary">支持 .xlsx 格式</Text>
      </Space>
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Alert message={`已上传: ${excelFile?.name}`} type="info" showIcon />

      <Text type="secondary">为每列选择映射的目标字段。</Text>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        {columns.map((c) => {
          const cfg = columnConfigs[c] || {};
          return (
            <div key={c} style={{ minWidth: 140 }}>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>
                {c.length > 10 ? c.slice(0, 8) + '...' : c}
              </Text>
              <Select
                size="small"
                style={{ width: '100%' }}
                placeholder="映射"
                value={cfg.targetField || undefined}
                onChange={(val) =>
                  setColumnConfigs((prev) => ({
                    ...prev,
                    [c]: { ...prev[c], targetField: val || null },
                  }))
                }
                allowClear
              >
                <Option value="">不映射</Option>
                {TARGET_FIELDS.map((f) => (
                  <Option key={f.key} value={f.key}>
                    {f.label}
                    {f.required && <span style={{ color: 'red' }}> *</span>}
                  </Option>
                ))}
              </Select>
            </div>
          );
        })}
      </div>

      <Table
        columns={previewTableCols}
        dataSource={previewTableData}
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        bordered
      />

      <Divider />
      <Space>
        <Button onClick={handleReset}>重新上传</Button>
        <Button type="primary" loading={loading} onClick={handleImport}>
          确认导入
        </Button>
      </Space>
    </Space>
  );
}

export default RosterImportForm;
