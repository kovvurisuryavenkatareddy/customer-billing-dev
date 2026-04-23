/**
 * Filter Participants panel using Ant Design Card, Form, Input, Select, DatePicker, Button.
 */
import React, { useEffect } from 'react';
import { Card, Form, Input, Select, DatePicker, Button, Row, Col, Space } from 'antd';
import { FilterOutlined, ClearOutlined, SearchOutlined } from '@ant-design/icons';
import { toISO } from '../utils/dates';

<<<<<<< HEAD
function normalizeForSearch(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fuzzyIncludes(haystack, needle) {
  const h = normalizeForSearch(haystack);
  const n = normalizeForSearch(needle);
  if (!n) return true;
  return h.includes(n);
}

export default function CustomerSearch({
  onSearch,
  status = 'active',
  onStatusChange,
  serviceName,
  onServiceNameChange,
  customerOptions = [],
  selectedCustomerIds = [],
  onSelectedCustomerIdsChange,
}) {
=======
export default function CustomerSearch({ onSearch, status = 'active', onStatusChange }) {
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldValue('status', status);
  }, [status, form]);

  const dateToISO = (d) => {
    if (!d) return '';
    const str = typeof d === 'string' ? d : (d.format ? d.format('YYYY-MM-DD') : '');
    return toISO(str);
  };

  const triggerSearch = (values = {}) => {
    const v = form.getFieldsValue();
    const firstName = (values.firstName ?? v.firstName ?? '').trim();
    const lastName = (values.lastName ?? v.lastName ?? '').trim();
    const st = values.status ?? v.status ?? status;
    const dob = values.dateOfBirth ?? v.dateOfBirth;
    const startDate = values.startDate ?? v.startDate;
    const endDate = values.endDate ?? v.endDate;
    onSearch({
      firstName,
      lastName,
      dateOfBirth: dateToISO(dob),
      status: st,
      startDate: dateToISO(startDate),
      endDate: dateToISO(endDate),
      _rawStart: startDate?.format?.('YYYY-MM-DD') ?? '',
      _rawEnd: endDate?.format?.('YYYY-MM-DD') ?? '',
      _rawDOB: dob?.format?.('YYYY-MM-DD') ?? '',
    });
  };

  const clearFilters = () => {
    form.resetFields();
    onStatusChange?.('active');
<<<<<<< HEAD
    if (onServiceNameChange) onServiceNameChange('');
    if (onSelectedCustomerIdsChange) onSelectedCustomerIdsChange([]);
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
    onSearch({
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      status: 'active',
      startDate: '',
      endDate: '',
    });
  };

<<<<<<< HEAD
  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#475569' };

  return (
    <Card
      className="mb-4 shadow-sm border border-slate-200"
      styles={{ body: { padding: '14px 16px' } }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <Space align="center">
          <FilterOutlined className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">Filter Participants</span>
        </Space>
        <Button size="small" icon={<ClearOutlined />} onClick={clearFilters}>
=======
  return (
    <Card
      className="mb-6 shadow-sm border border-blue-100"
      styles={{ body: { padding: '20px 24px' } }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <Space align="center">
          <FilterOutlined className="text-[#007bff] text-lg" />
          <span className="text-base font-semibold text-[#1a253c]">Filter Participants</span>
        </Space>
        <Button icon={<ClearOutlined />} onClick={clearFilters}>
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
          Clear filters
        </Button>
      </div>

      <Form
        form={form}
        layout="vertical"
<<<<<<< HEAD
        size="small"
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
        initialValues={{
          status: status,
          firstName: '',
          lastName: '',
          dateOfBirth: null,
          startDate: null,
          endDate: null,
        }}
        onValuesChange={(_, all) => triggerSearch(all)}
      >
<<<<<<< HEAD
        <Row gutter={[12, 8]}>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Form.Item name="status" label={<span style={labelStyle}>Status</span>}>
              <Select
                size="small"
=======
        <Row gutter={[16, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="status" label="Status">
              <Select
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'all', label: 'All' },
                ]}
                onChange={(val) => {
                  onStatusChange?.(val);
                  triggerSearch({ ...form.getFieldsValue(), status: val });
                }}
                allowClear={false}
              />
            </Form.Item>
          </Col>
<<<<<<< HEAD
          <Col xs={24} sm={12} md={8} lg={4}>
            <Form.Item name="firstName" label={<span style={labelStyle}>First Name</span>}>
              <Input size="small" placeholder="First name" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Form.Item name="lastName" label={<span style={labelStyle}>Last Name</span>}>
              <Input size="small" placeholder="Last name" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Form.Item name="dateOfBirth" label={<span style={labelStyle}>Date of Birth</span>}>
              <DatePicker
                format="MM/DD/YYYY"
                className="w-full"
                placeholder="MM/DD/YYYY"
                allowClear
                size="small"
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Form.Item name="startDate" label={<span style={labelStyle}>From Date</span>}>
              <DatePicker
                format="MM/DD/YYYY"
                className="w-full"
                placeholder="MM/DD/YYYY"
                allowClear
                size="small"
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Form.Item name="endDate" label={<span style={labelStyle}>To Date</span>}>
              <DatePicker
                format="MM/DD/YYYY"
                className="w-full"
                placeholder="MM/DD/YYYY"
                allowClear
                size="small"
=======
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="firstName" label="First Name">
              <Input placeholder="First name" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="lastName" label="Last Name">
              <Input placeholder="Last name" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="dateOfBirth" label="Date of Birth">
              <DatePicker
                format="MM-DD-YYYY"
                className="w-full"
                placeholder="MM-DD-YYYY"
                allowClear
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="startDate" label="From Date">
              <DatePicker
                format="MM-DD-YYYY"
                className="w-full"
                placeholder="MM-DD-YYYY"
                allowClear
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="endDate" label="To Date">
              <DatePicker
                format="MM-DD-YYYY"
                className="w-full"
                placeholder="MM-DD-YYYY"
                allowClear
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
              />
            </Form.Item>
          </Col>
        </Row>
<<<<<<< HEAD
        {(onServiceNameChange || onSelectedCustomerIdsChange) && (
          <Row gutter={[12, 8]}>
            {onServiceNameChange && (
              <Col xs={24} sm={12} md={8} lg={6}>
                <Form.Item label={<span style={labelStyle}>Service Name</span>}>
                  <Input
                    size="small"
                    placeholder="Search service name"
                    allowClear
                    value={serviceName}
                    onChange={(e) => onServiceNameChange(e.target.value)}
                  />
                </Form.Item>
              </Col>
            )}
            {onSelectedCustomerIdsChange && (
              <Col xs={24} sm={12} md={16} lg={10}>
                <Form.Item label={<span style={labelStyle}>Select Customer(s) for Export (optional)</span>}>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    filterOption={(input, option) => fuzzyIncludes(option?.label, input)}
                    placeholder="If selected, export includes all rows for selected customers"
                    options={customerOptions}
                    value={selectedCustomerIds}
                    onChange={(vals) => onSelectedCustomerIdsChange(vals)}
                    className="w-full"
                    size="small"
                  />
                </Form.Item>
              </Col>
            )}
          </Row>
        )}
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      </Form>
    </Card>
  );
}
