import { useState } from 'react';
import {
  Upload, Button, Table, Select, Checkbox, Input, message, Typography, Space, Divider, Alert, Tag, Tree, Card,
} from 'antd';
import { UploadOutlined, EyeOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../../api';

const { Text } = Typography;
const { Option } = Select;

const TARGET_FIELDS = [
  { key: '教材名', label: '教材名', required: true },
  { key: 'ISBN', label: 'ISBN', required: true },
  { key: '价格', label: '价格', required: false },
  { key: '出版社', label: '出版社', required: false },
  { key: '班级', label: '班级', required: true },
  { key: '班级理论人数', label: '班级理论人数', required: false },
  { key: '校区', label: '校区', required: false },
  { key: '学院', label: '学院', required: false },
  { key: '专业', label: '专业', required: false },
  { key: '课程名', label: '课程名', required: false },
];

function TextbookImportForm({ orderId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [previewData, setPreviewData] = useState([]);
  const [columnConfigs, setColumnConfigs] = useState({});
  const [dryRunResult, setDryRunResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [tbPagination, setTbPagination] = useState({ pageSize: 5, current: 1 });

  const handleUpload = async ({ file }) => {
    setExcelFile(file);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post(`/api/orders/${orderId}/preview`, formData);
      const data = await res.json();
      if (res.ok) {
        setColumns(data.columns);
        setPreviewData(data.preview);
        setDryRunResult(null);

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

  const updateColumnConfig = (colName, updates) => {
    setColumnConfigs((prev) => ({
      ...prev,
      [colName]: { ...prev[colName], ...updates },
    }));
    setDryRunResult(null);
  };

  const buildMapping = () => {
    const mapping = {};
    Object.entries(columnConfigs).forEach(([col, cfg]) => {
      if (cfg.isComposite && cfg.compositeParts) {
        Object.entries(cfg.compositeParts).forEach(([partIdx, targetField]) => {
          if (targetField) {
            mapping[targetField] = {
              col,
              is_composite: true,
              delimiter: cfg.delimiter,
              part_index: parseInt(partIdx) - 1,
            };
          }
        });
      } else if (cfg.targetField) {
        mapping[cfg.targetField] = {
          col,
          is_composite: false,
          is_multivalue: !!cfg.isMultivalue,
          delimiter: cfg.delimiter,
        };
      }
    });
    return mapping;
  };

  const callImport = async (isDryRun) => {
    const mapping = buildMapping();
    const missing = TARGET_FIELDS.filter(
      (f) => f.required && (!mapping[f.key] || !mapping[f.key].col)
    );
    if (missing.length > 0) {
      message.error(`缺少必填字段映射: ${missing.map((f) => f.label).join(', ')}`);
      return null;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', excelFile);
    formData.append('mapping', JSON.stringify(mapping));
    formData.append('dry_run', String(isDryRun));

    try {
      const res = await api.post(`/api/orders/${orderId}/import`, formData);
      const data = await res.json();
      if (res.ok) {
        return data;
      } else {
        message.error(data.detail || '操作失败');
        return null;
      }
    } catch {
      message.error('网络错误');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleDryRun = async () => {
    const data = await callImport(true);
    if (data) {
      setDryRunResult(data);
      setTbPagination({ pageSize: 5, current: 1 });
      message.success('生成预览完成');
    }
  };

  const handleImport = async () => {
    const data = await callImport(false);
    if (data) {
      setImportResult(data);
      message.success('征订表导入成功');
      if (onSuccess) onSuccess(data);
    }
  };

  const handleReset = () => {
    setExcelFile(null);
    setColumns([]);
    setPreviewData([]);
    setColumnConfigs({});
    setDryRunResult(null);
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

  const mappedCols = Object.entries(columnConfigs).filter(([_, cfg]) => cfg.targetField || (cfg.compositeParts && Object.values(cfg.compositeParts).some(Boolean)));

  const buildClassTreeData = (tree) => {
    return Object.entries(tree).map(([campus, colleges], idx) => ({
      title: campus,
      key: `campus-${idx}`,
      children: Object.entries(colleges).map(([college, classes], cidx) => ({
        title: college,
        key: `college-${idx}-${cidx}`,
        children: classes.map((cls, clidx) => ({
          title: `${cls.class_name}${cls.major ? ` (${cls.major})` : ''}`,
          key: `class-${idx}-${cidx}-${clidx}`,
        })),
      })),
    }));
  };

  const textbookTableColumns = [
    { title: '教材名', dataIndex: 'name', key: 'name' },
    { title: 'ISBN', dataIndex: 'isbn', key: 'isbn' },
    { title: '价格', dataIndex: 'price', key: 'price' },
    { title: '出版社', dataIndex: 'publisher', key: 'publisher' },
  ];

  if (importResult) {
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert
          message="征订表导入成功"
          description={
            <Space direction="vertical">
              <Text>已导入 {importResult.textbooks_count} 种教材、{importResult.classes_count} 个班级、{importResult.items_count} 条征订记录</Text>
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
              <Button type="primary" onClick={handleReset}>继续上传</Button>
            </Space>
          }
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
        />
      </Space>
    );
  }

  if (!columns.length) {
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Upload beforeUpload={() => false} onChange={handleUpload} maxCount={1} accept=".xlsx">
          <Button icon={<UploadOutlined />}>上传征订表（Excel）</Button>
        </Upload>
        <Text type="secondary">支持 .xlsx / .xls 格式</Text>
      </Space>
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Alert message={`已上传: ${excelFile?.name}`} type="info" showIcon />

      <Text type="secondary">为每列选择映射的目标字段。支持复合列拆分和多值列拆分。</Text>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns.length}, minmax(140px, 1fr))`,
          gap: 8,
          marginBottom: 8,
          padding: '8px 0',
          borderBottom: '2px solid #1677ff',
        }}
      >
        {columns.map((c) => {
          const cfg = columnConfigs[c] || {};
          const mappedField = cfg.targetField;
          const mappedLabel = mappedField
            ? TARGET_FIELDS.find((f) => f.key === mappedField)?.label
            : null;

          return (
            <div key={c} style={{ minWidth: 140, padding: '0 4px' }}>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>
                {c.length > 10 ? c.slice(0, 8) + '...' : c}
              </Text>
              <Select
                size="small"
                style={{ width: '100%' }}
                placeholder="映射"
                value={mappedField || undefined}
                onChange={(val) =>
                  updateColumnConfig(c, {
                    targetField: val || null,
                    isComposite: false,
                    isMultivalue: false,
                  })
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

              {mappedField && (
                <div style={{ marginTop: 4 }}>
                  <Checkbox
                    checked={!!cfg.isComposite}
                    onChange={(e) => {
                      const isComposite = e.target.checked;
                      const updates = { isComposite, isMultivalue: false };
                      if (isComposite) {
                        const delimiter = cfg.delimiter ?? ' ';
                        const firstVal = previewData[0]?.[columns.indexOf(c)];
                        const parts = firstVal ? String(firstVal).split(delimiter) : [''];
                        const compositeParts = {};
                        parts.forEach((_, idx) => {
                          compositeParts[String(idx + 1)] = null;
                        });
                        updates.compositeParts = compositeParts;
                        updates.delimiter = delimiter;
                      }
                      updateColumnConfig(c, updates);
                    }}
                    style={{ fontSize: 11 }}
                  >
                    复合
                  </Checkbox>
                  <Checkbox
                    checked={!!cfg.isMultivalue}
                    onChange={(e) =>
                      updateColumnConfig(c, {
                        isMultivalue: e.target.checked,
                        isComposite: false,
                      })
                    }
                    style={{ fontSize: 11 }}
                  >
                    多值
                  </Checkbox>
                </div>
              )}

              {cfg.isComposite && (
                <>
                  <Input
                    size="small"
                    style={{ width: '100%', marginTop: 4 }}
                    value={cfg.delimiter ?? ' '}
                    onChange={(e) => {
                      const delimiter = e.target.value;
                      const firstVal = previewData[0]?.[columns.indexOf(c)];
                      const parts = firstVal ? String(firstVal).split(delimiter) : [''];
                      const compositeParts = {};
                      parts.forEach((_, idx) => {
                        compositeParts[String(idx + 1)] = cfg.compositeParts?.[String(idx + 1)] || null;
                      });
                      updateColumnConfig(c, { delimiter, compositeParts });
                    }}
                    placeholder="分隔符"
                  />
                  {(cfg.compositeParts ? Object.keys(cfg.compositeParts) : []).map((partIdx) => (
                    <div key={partIdx} style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        第{partIdx}部分
                      </Text>
                      <Select
                        size="small"
                        style={{ width: '100%' }}
                        placeholder="映射到"
                        value={cfg.compositeParts?.[partIdx] || undefined}
                        onChange={(val) =>
                          updateColumnConfig(c, {
                            compositeParts: {
                              ...cfg.compositeParts,
                              [partIdx]: val || null,
                            },
                          })
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
                  ))}
                </>
              )}

              {cfg.isMultivalue && (
                <Input
                  size="small"
                  style={{ width: '100%', marginTop: 4 }}
                  value={cfg.delimiter ?? '、'}
                  onChange={(e) => updateColumnConfig(c, { delimiter: e.target.value })}
                  placeholder="分隔符"
                />
              )}

              {mappedField && !cfg.isComposite && (
                <Tag size="small" color="blue" style={{ marginTop: 4 }}>
                  {mappedLabel}
                </Tag>
              )}
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

      {mappedCols.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">已映射字段：</Text>
          {mappedCols.map(([col, cfg]) => {
            if (cfg.compositeParts) {
              return Object.entries(cfg.compositeParts)
                .filter(([_, v]) => v)
                .map(([partIdx, targetField]) => (
                  <Tag key={`${col}-${partIdx}`} color="blue" style={{ margin: '4px 4px 0 0' }}>
                    {col} 第{partIdx}部分 → {TARGET_FIELDS.find((f) => f.key === targetField)?.label}
                  </Tag>
                ));
            }
            return (
              <Tag key={col} color="blue" style={{ margin: '4px 4px 0 0' }}>
                {col} → {TARGET_FIELDS.find((f) => f.key === cfg.targetField)?.label}
              </Tag>
            );
          })}
        </div>
      )}

      <Divider />
      <Space>
        <Button onClick={handleReset}>重新上传</Button>
        <Button icon={<EyeOutlined />} loading={loading} onClick={handleDryRun}>
          预览生成结果
        </Button>
        <Button type="primary" loading={loading} onClick={handleImport}>
          确认导入
        </Button>
      </Space>

      {dryRunResult && (
        <>
          <Divider>生成预览</Divider>
          <Alert
            message={`Excel ${dryRunResult.expanded_rows_count ?? '?'} 行（展开后）→ 生成 ${dryRunResult.textbooks_count} 种教材、${dryRunResult.classes_count} 个班级、${dryRunResult.items_count} 条征订记录`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          {dryRunResult.warnings?.length > 0 && (
            <Alert
              message="警告"
              description={
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {dryRunResult.warnings.map((w, i) => (<li key={i}>{w}</li>))}
                </ul>
              }
              type="warning"
              style={{ marginBottom: 16 }}
            />
          )}

          {dryRunResult.logs?.length > 0 && (
            <div
              style={{
                marginBottom: 16,
                padding: '8px 12px',
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              <Text strong style={{ color: '#389e0d', fontSize: 13 }}>导入日志</Text>
              <div style={{ marginTop: 4 }}>
                {dryRunResult.logs.map((log, i) => (
                  <div key={i} style={{ color: '#595959', lineHeight: '1.8' }}>{log}</div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 16 }}>
            <Card title="教材预览" style={{ flex: 1 }} size="small">
              <Table
                columns={textbookTableColumns}
                dataSource={dryRunResult.textbooks_preview?.map((tb, idx) => ({ ...tb, key: idx })) || []}
                size="small"
                pagination={{
                  ...tbPagination,
                  showSizeChanger: true,
                  pageSizeOptions: ['5', '10', '20', '50', '100'],
                  showTotal: (total) => `共 ${total} 条`,
                  onChange: (page, pageSize) => setTbPagination({ current: page, pageSize }),
                }}
              />
            </Card>

            <Card title="班级预览" style={{ flex: 1 }} size="small">
              <Tree
                treeData={buildClassTreeData(dryRunResult.classes_tree || {})}
                defaultExpandAll
              />
            </Card>
          </div>
        </>
      )}
    </Space>
  );
}

export default TextbookImportForm;
