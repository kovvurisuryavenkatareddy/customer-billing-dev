/**
 * Filter Participants panel using Ant Design Card, Form, Input, Select, DatePicker, Button.
 */
import React, { useEffect } from 'react';
import { Card, Form, Input, Select, DatePicker, Button, Row, Col, Space } from 'antd';
import { FilterOutlined, ClearOutlined, SearchOutlined } from '@ant-design/icons';
import { toISO } from '../utils/dates';

export default function CustomerSearch({ onSearch, status = 'active', onStatusChange }) {
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
    onSearch({
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      status: 'active',
      startDate: '',
      endDate: '',
    });
  };

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
          Clear filters
        </Button>
      </div>

      <Form
        form={form}
        layout="vertical"
        size="small"
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
        <Row gutter={[12, 8]}>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Form.Item name="status" label={<span style={labelStyle}>Status</span>}>
              <Select
                size="small"
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
                format="MM-DD-YYYY"
                className="w-full"
                placeholder="MM-DD-YYYY"
                allowClear
                size="small"
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Form.Item name="startDate" label={<span style={labelStyle}>From Date</span>}>
              <DatePicker
                format="MM-DD-YYYY"
                className="w-full"
                placeholder="MM-DD-YYYY"
                allowClear
                size="small"
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Form.Item name="endDate" label={<span style={labelStyle}>To Date</span>}>
              <DatePicker
                format="MM-DD-YYYY"
                className="w-full"
                placeholder="MM-DD-YYYY"
                allowClear
                size="small"
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  );
}
