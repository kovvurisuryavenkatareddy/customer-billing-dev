import React, { useMemo, useCallback, useState, useEffect } from 'react';
<<<<<<< HEAD
import { Table, Button, Dropdown, Typography, Space } from 'antd';
import { EditOutlined, EllipsisOutlined } from '@ant-design/icons';
=======
import { Table, Button, Space, Typography } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
import { formatMMDDYYYY } from '../utils/dates';
import CustomerEntryModal from './CustomerEntryModal';

const { Link: TypographyLink } = Typography;

export default function CustomerList({
  customers = [],
  onEdit,
  onAddService,
  onChangeStatus,
<<<<<<< HEAD
  onCustomerUpdated,
  searchText = '',
  onSelectionChange,
=======
  searchText = ''
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
}) {
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [editingStatusFor, setEditingStatusFor] = useState(null);
  const [savingStatusFor, setSavingStatusFor] = useState(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
<<<<<<< HEAD
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [selectedCustomerCode, setSelectedCustomerCode] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
=======
  const [selectedCustomerCode, setSelectedCustomerCode] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400

  useEffect(() => {
    if (customers.length > 0 && isInitialLoad) {
      setIsInitialLoad(false);
    }
  }, [customers, isInitialLoad]);

  const formatDate = useCallback((d) => {
    return formatMMDDYYYY(d);
  }, []);

<<<<<<< HEAD
  // Group entries by batch_id so we show one row per batch
  const dataSource = useMemo(() => {
    const batchKey = (c) => c.batch_id || (c.entry_id != null ? `legacy-${c.entry_id}` : `single-${c.id}-${c.entry_id}`);
    const groups = new Map();
    for (const c of customers) {
      const key = batchKey(c);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    return Array.from(groups.entries()).map(([batchKeyId, entries]) => {
      const first = entries[0];
      const daysSum = entries.reduce((s, e) => s + (Number(e.days) || 0), 0);
      const billedSum = entries.reduce((s, e) => s + (Number(e.amount_billed) || 0), 0);
      const paidSum = entries.reduce((s, e) => s + (Number(e.amount_paid) || 0), 0);
      const serviceNames = [...new Set(entries.map(e => e.service_name || e.serviceName || '—').filter(Boolean))];
      const serviceName = serviceNames.length === 0
        ? 'No service'
        : serviceNames.length <= 2
          ? serviceNames.join(', ')
          : `${serviceNames.slice(0, 2).join(', ')} +${serviceNames.length - 2} more`;
      const startDates = entries.map(e => e.start_date).filter(Boolean);
      const endDates = entries.map(e => e.end_date).filter(Boolean);
      const startDate = startDates.length ? startDates.sort()[0] : first.start_date;
      const endDate = endDates.length ? endDates.sort().reverse()[0] : first.end_date;
      return {
        key: batchKeyId,
        id: first.id,
        customerId: first.id,
        name: `${(first.first_name || '').trim()}${first.last_name ? ', ' + (first.last_name || '').trim() : ''}`.trim(),
        firstName: first.first_name || '',
        lastName: first.last_name || '',
        dateOfBirth: first.date_of_birth || '',
        activeStatus: first.active_status || 'active',
        idNumber: first.id_number || '',
        fIdNumber: first.f_id_number || '',
        serviceName,
        startDate,
        endDate,
        days: daysSum,
        ratePerDay: first.rate_per_day || 0,
        amountBilled: billedSum,
        amountPaid: paidSum,
        due: billedSum - paidSum,
        paymentDate: first.date_of_payment,
        dateSubmitted: first.date_submitted,
        denialCodes: first.denial_codes || [],
        isResubmission: first.is_resubmission || false,
        entryId: first.entry_id,
        batchId: first.batch_id || (first.entry_id != null ? `legacy-${first.entry_id}` : null),
        customer: first,
      };
    });
=======
  // Process customers with latest entry data
  const dataSource = useMemo(() => {
    return customers.map(c => ({
      key: c.entry_id || `cust-${c.id}`,
      id: c.id,
      customerId: c.id,
      name: `${(c.first_name || '').trim()}${c.last_name ? ', ' + (c.last_name || '').trim() : ''}`.trim(),
      firstName: c.first_name || '',
      lastName: c.last_name || '',
      dateOfBirth: c.date_of_birth || '',
      activeStatus: c.active_status || 'active',
      idNumber: c.id_number || '',
      fIdNumber: c.f_id_number || '',
      serviceName: c.service_name || 'No service',
        startDate: c.start_date,
        endDate: c.end_date,
        days: c.days || 0,
        ratePerDay: c.rate_per_day || 0,
        amountBilled: Number(c.amount_billed || 0),
        amountPaid: Number(c.amount_paid || 0),
        due: c.due || 0,
        paymentDate: c.date_of_payment,
        dateSubmitted: c.date_submitted,
        denialCodes: c.denial_codes || [],
        isResubmission: c.is_resubmission || false,
        entryId: c.entry_id,
        customer: c
      }));
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
  }, [customers]);

  // Filter data based on search text
  const filteredData = useMemo(() => {
    if (!searchText) return dataSource;
    const lowerSearch = searchText.toLowerCase();
    return dataSource.filter(row =>
      row.firstName.toLowerCase().includes(lowerSearch) ||
      row.lastName.toLowerCase().includes(lowerSearch) ||
      (row.idNumber && String(row.idNumber).toLowerCase().includes(lowerSearch)) ||
      (row.fIdNumber && String(row.fIdNumber).toLowerCase().includes(lowerSearch)) ||
      row.serviceName.toLowerCase().includes(lowerSearch) ||
      (row.startDate && formatDate(row.startDate).toLowerCase().includes(lowerSearch)) ||
      (row.endDate && formatDate(row.endDate).toLowerCase().includes(lowerSearch)) ||
      (row.dateOfBirth && formatDate(row.dateOfBirth).toLowerCase().includes(lowerSearch))
    );
  }, [dataSource, searchText, formatDate]);

  // compute totals across all service lines (all pages)
  const allPagesTotals = useMemo(() => {
    const computed = filteredData.reduce((acc, row) => {
      acc.amountBilled += row.amountBilled;
      acc.amountPaid += row.amountPaid;
      return acc;
    }, { amountBilled: 0, amountPaid: 0 });
    computed.totalDue = computed.amountBilled - computed.amountPaid;
    return computed;
  }, [filteredData]);

  // Get unique values for filters
  const uniqueFirstNames = useMemo(() =>
    [...new Set(dataSource.map(item => item.firstName))].filter(Boolean).map(text => ({ text, value: text })),
    [dataSource]
  );

  const uniqueLastNames = useMemo(() =>
    [...new Set(dataSource.map(item => item.lastName))].filter(Boolean).map(text => ({ text, value: text })),
    [dataSource]
  );

<<<<<<< HEAD
=======
  const uniqueServices = useMemo(() =>
    [...new Set(dataSource.map(item => item.serviceName))].filter(Boolean).map(text => ({ text, value: text })),
    [dataSource]
  );

>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
  // Define columns for Ant Design Table with sorting and filtering
  const columns = [
    {
      title: 'S.No',
      key: 'sno',
      width: 50,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 170,
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (text, record) => (
        <TypographyLink
          className="customer-name font-semibold"
          onClick={() => {
            setSelectedCustomerId(record.customerId);
<<<<<<< HEAD
            setSelectedBatchId(record.batchId ?? null);
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
            setShowEntryModal(true);
          }}
          title="Click to view customer details"
        >
          {text || 'N/A'}
        </TypographyLink>
      ),
    },
    {
      title: 'DOB',
      dataIndex: 'dateOfBirth',
      key: 'dateOfBirth',
      width: 100,
      sorter: (a, b) => {
        if (!a.dateOfBirth) return 1;
        if (!b.dateOfBirth) return -1;
        return new Date(a.dateOfBirth) - new Date(b.dateOfBirth);
      },
      render: (date) => formatDate(date),
    },
    {
      title: 'ID #',
      dataIndex: 'idNumber',
      key: 'idNumber',
      width: 100,
      ellipsis: true,
      render: (text) => text || '—',
    },
    {
      title: 'F ID #',
      dataIndex: 'fIdNumber',
      key: 'fIdNumber',
      width: 100,
      ellipsis: true,
      render: (text) => text || '—',
    },
    {
<<<<<<< HEAD
      title: 'Amount Billed',
      dataIndex: 'amountBilled',
      key: 'amountBilled',
      width: 120,
=======
      title: 'Service Type',
      dataIndex: 'serviceName',
      key: 'serviceName',
      width: 150,
      sorter: (a, b) => a.serviceName.localeCompare(b.serviceName),
      filters: uniqueServices,
      onFilter: (value, record) => record.serviceName === value,
      ellipsis: true,
      render: (text) => (
        <span style={{ fontWeight: '500' }}>
          {text || 'No service'}
        </span>
      ),
    },
    {
      title: 'Start Date',
      dataIndex: 'startDate',
      key: 'startDate',
      width: 130,
      sorter: (a, b) => {
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return new Date(a.startDate) - new Date(b.startDate);
      },
      render: (date) => formatDate(date),
    },
    {
      title: 'End Date',
      dataIndex: 'endDate',
      key: 'endDate',
      width: 130,
      sorter: (a, b) => {
        if (!a.endDate) return 1;
        if (!b.endDate) return -1;
        return new Date(a.endDate) - new Date(b.endDate);
      },
      render: (date) => formatDate(date),
    },
    {
      title: 'Days',
      dataIndex: 'days',
      key: 'days',
      width: 90,
      align: 'center',
      sorter: (a, b) => a.days - b.days,
      render: (value) => (
        <span style={{
          display: 'inline-block',
          backgroundColor: value > 0 ? '#e6f3ff' : 'transparent',
          padding: '4px 12px',
          borderRadius: '12px',
          fontWeight: '600',
          color: value > 0 ? '#007bff' : '#95a5a6'
        }}>
          {value}
        </span>
      ),
    },
    {
      title: 'Rate/Day',
      dataIndex: 'ratePerDay',
      key: 'ratePerDay',
      width: 110,
      align: 'right',
      sorter: (a, b) => (a.ratePerDay || 0) - (b.ratePerDay || 0),
      render: (value) => (
        <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>
          ${(value || 0).toFixed(2)}
        </span>
      ),
    },
    {
      title: 'Amount Billed',
      dataIndex: 'amountBilled',
      key: 'amountBilled',
      width: 140,
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      align: 'right',
      sorter: (a, b) => a.amountBilled - b.amountBilled,
      render: (value) => (
        <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>
          ${value.toFixed(2)}
        </span>
      ),
    },
    {
      title: 'Amount Paid',
      dataIndex: 'amountPaid',
      key: 'amountPaid',
<<<<<<< HEAD
      width: 120,
=======
      width: 140,
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      align: 'right',
      sorter: (a, b) => a.amountPaid - b.amountPaid,
      render: (value) => (
        <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>
          ${value.toFixed(2)}
        </span>
      ),
    },
    {
      title: 'Due',
      key: 'due',
<<<<<<< HEAD
      width: 90,
=======
      width: 110,
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      align: 'right',
      sorter: (a, b) => (a.amountBilled - a.amountPaid) - (b.amountBilled - b.amountPaid),
      render: (_, record) => {
        const due = record.amountBilled - record.amountPaid;
        return (
          <span style={{
            color: due > 0 ? '#e74c3c' : '#95a5a6',
            fontWeight: '600',
            fontFamily: 'monospace'
          }}>
            ${due.toFixed(2)}
          </span>
        );
      },
    },
    {
<<<<<<< HEAD
      title: 'Actions',
      key: 'actions',
      width: 90,
      fixed: 'right',
      align: 'center',
      render: (_, record) => {
        const handleEdit = () => {
          onEdit({
            customer: record.customer,
            batchId: record.batchId,
            service: {
              id: record.entryId,
              entryId: record.entryId,
              entry_id: record.entryId,
              serviceName: record.serviceName,
              days: record.days,
              ratePerDay: record.ratePerDay,
              amountBilled: record.amountBilled,
              amountPaid: record.amountPaid,
              dateOfPayment: record.paymentDate,
              startDate: record.startDate,
              endDate: record.endDate,
              denialCodes: record.denialCodes,
            },
          });
        };

        const items = [{ key: 'edit', label: 'Edit', icon: <EditOutlined /> }];

        return (
          <div className="flex items-center justify-center">
            <Space size={4} className="hidden md:inline-flex">
              <Button
                type="primary"
                size="small"
                icon={<EditOutlined />}
                onClick={handleEdit}
                style={{ padding: '2px 8px', fontSize: '12px', minWidth: 'auto', height: 26 }}
              >
                Edit
              </Button>
            </Space>

            <div className="md:hidden">
              <Dropdown
                trigger={['click']}
                menu={{
                  items,
                  onClick: ({ key }) => {
                    if (key === 'edit') handleEdit();
                  },
                }}
                placement="bottomRight"
              >
                <Button size="small" type="text" aria-label="Actions" icon={<EllipsisOutlined />} />
              </Dropdown>
            </div>
          </div>
        );
      },
    },
  ];

  const rowSelection = useMemo(() => {
    return {
      selectedRowKeys,
      onChange: (nextKeys, selectedRows) => {
        setSelectedRowKeys(nextKeys);

        // IMPORTANT: table rows are grouped by batch, so dedupe customers by customerId.
        const map = new Map();
        for (const row of selectedRows || []) {
          const cid = row?.customerId;
          if (cid != null && !map.has(cid)) map.set(cid, row.customer);
        }
        onSelectionChange?.(Array.from(map.values()));
      },
    };
  }, [selectedRowKeys, onSelectionChange]);

  return (
    <div>
      <Table
        className="customer-ledger-table"
        dataSource={filteredData}
        columns={columns}
        rowSelection={rowSelection}
        size="small"
        bordered
        sticky
=======
      title: 'Payment Date',
      dataIndex: 'paymentDate',
      key: 'paymentDate',
      width: 130,
      sorter: (a, b) => {
        if (!a.paymentDate) return 1;
        if (!b.paymentDate) return -1;
        return new Date(a.paymentDate) - new Date(b.paymentDate);
      },
      render: (date) => formatDate(date),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small" wrap>
          <Button
            type="primary"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit({
              customer: record.customer,
              service: {
                id: record.entryId,
                serviceName: record.serviceName,
                days: record.days,
                ratePerDay: record.ratePerDay,
                amountBilled: record.amountBilled,
                amountPaid: record.amountPaid,
                dateOfPayment: record.paymentDate,
                startDate: record.startDate,
                endDate: record.endDate,
              }
            })}
          >
            Edit
          </Button>
          <Button
            type="default"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => onAddService?.(record.customer)}
          >
            Add
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Table
        dataSource={filteredData}
        columns={columns}
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
        pagination={{
          ...pagination,
          showSizeChanger: window.innerWidth >= 576,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} records`,
          pageSizeOptions: ['10', '20', '50', '100'],
          responsive: true,
          simple: window.innerWidth < 576,
          showQuickJumper: window.innerWidth >= 768,
          onChange: (page, pageSize) => {
            setPagination({ current: page, pageSize: pageSize || 10 });
          },
          onShowSizeChange: (current, size) => {
            setPagination({ current: 1, pageSize: size });
          },
        }}
<<<<<<< HEAD
        scroll={{ x: 1200 }}
        tableLayout="fixed"
        summary={(pageData) => {
=======
        scroll={{ x: true }}
        tableLayout="auto"
        summary={(pageData) => {
          // Calculate current page totals from pageData
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
          const pageTotals = pageData.reduce((acc, row) => {
            acc.amountBilled += row.amountBilled || 0;
            acc.amountPaid += row.amountPaid || 0;
            return acc;
          }, { amountBilled: 0, amountPaid: 0 });
          pageTotals.totalDue = pageTotals.amountBilled - pageTotals.amountPaid;

<<<<<<< HEAD
          const formatCurrency = (value) =>
            value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          const TotalsBar = ({ label, billed, paid, due, isAllPages }) => (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2rem',
                padding: '10px 16px',
                background: isAllPages ? 'linear-gradient(to right, #f1f5f9, #e2e8f0)' : '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              <span style={{ color: '#475569', minWidth: '140px', fontWeight: 600 }}>{label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Billed</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>
                  ${formatCurrency(billed)}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '1rem', borderLeft: '1px solid #e2e8f0' }}>
                <span style={{ color: '#64748b' }}>Paid</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>
                  ${formatCurrency(paid)}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '1rem', borderLeft: '1px solid #e2e8f0' }}>
                <span style={{ color: '#64748b' }}>Due</span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: due > 0 ? '#dc2626' : due < 0 ? '#d97706' : '#64748b',
                  }}
                >
                  ${formatCurrency(due)}
                </span>
              </span>
            </div>
          );

          return (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={columns.length} style={{ padding: 0, borderBottom: 'none' }}>
                  <TotalsBar
                    label="Current Page Totals"
                    billed={pageTotals.amountBilled}
                    paid={pageTotals.amountPaid}
                    due={pageTotals.totalDue}
                    isAllPages={false}
                  />
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={columns.length} style={{ padding: 0, borderBottom: 'none' }}>
                  <TotalsBar
                    label="All Pages Totals"
                    billed={allPagesTotals.amountBilled}
                    paid={allPagesTotals.amountPaid}
                    due={allPagesTotals.totalDue}
                    isAllPages
                  />
=======
          // Format number with thousand separators
          const formatCurrency = (value) => {
            return value.toLocaleString('en-US', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            });
          };

          return (
            <Table.Summary fixed>
              {/* Current Page Totals */}
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={columns.length}>
                  <div className="ledger-totals-row current-page">
                    <span className="ledger-sno"></span>
                    <span className="ledger-name">Current Page Totals:</span>
                    <span className="ledger-dob"></span>
                    <span className="ledger-id-number"></span>
                    <span className="ledger-f-id-number"></span>
                    <span className="ledger-service"></span>
                    <span className="ledger-start"></span>
                    <span className="ledger-end"></span>
                    <span className="ledger-days"></span>
                    <span className="ledger-rate">—</span>
                    <span className="ledger-billed">${formatCurrency(pageTotals.amountBilled)}</span>
                    <span className="ledger-paid">${formatCurrency(pageTotals.amountPaid)}</span>
                    <span className={`ledger-due ${pageTotals.totalDue > 0 ? 'positive' : 'zero'}`}>
                      ${formatCurrency(pageTotals.totalDue)}
                    </span>
                    <span className="ledger-payment"></span>
                    <span className="ledger-actions"></span>
                  </div>
                </Table.Summary.Cell>
              </Table.Summary.Row>

              {/* All Pages Totals */}
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={columns.length}>
                  <div className="ledger-totals-row all-pages">
                    <span className="ledger-sno"></span>
                    <span className="ledger-name">All Pages Totals:</span>
                    <span className="ledger-dob"></span>
                    <span className="ledger-id-number"></span>
                    <span className="ledger-f-id-number"></span>
                    <span className="ledger-service"></span>
                    <span className="ledger-start"></span>
                    <span className="ledger-end"></span>
                    <span className="ledger-days"></span>
                    <span className="ledger-rate">—</span>
                    <span className="ledger-billed">${formatCurrency(allPagesTotals.amountBilled)}</span>
                    <span className="ledger-paid">${formatCurrency(allPagesTotals.amountPaid)}</span>
                    <span className={`ledger-due ${allPagesTotals.totalDue > 0 ? 'positive' : allPagesTotals.totalDue < 0 ? 'negative' : 'zero'}`}>
                      ${formatCurrency(allPagesTotals.totalDue)}
                    </span>
                    <span className="ledger-payment"></span>
                    <span className="ledger-actions"></span>
                  </div>
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />

      {showEntryModal && (
        <CustomerEntryModal
          customerId={selectedCustomerId}
<<<<<<< HEAD
          batchId={selectedBatchId}
          onUpdated={onCustomerUpdated}
          onClose={() => {
            setShowEntryModal(false);
            setSelectedCustomerId(null);
            setSelectedBatchId(null);
=======
          onClose={() => {
            setShowEntryModal(false);
            setSelectedCustomerId(null);
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
          }}
        />
      )}
    </div>
  );
}