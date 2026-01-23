import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { Table } from 'antd';
import { formatMMDDYYYY } from '../utils/dates';
import CustomerEntryModal from './CustomerEntryModal';

export default function CustomerList({
  customers = [],
  onEdit,
  onAddService,
  onChangeStatus,
  searchText = ''
}) {
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [editingStatusFor, setEditingStatusFor] = useState(null);
  const [savingStatusFor, setSavingStatusFor] = useState(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomerCode, setSelectedCustomerCode] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (customers.length > 0 && isInitialLoad) {
      setIsInitialLoad(false);
    }
  }, [customers, isInitialLoad]);

  const formatDate = useCallback((d) => {
    return formatMMDDYYYY(d);
  }, []);

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
  }, [customers]);

  // Filter data based on search text
  const filteredData = useMemo(() => {
    if (!searchText) return dataSource;
    const lowerSearch = searchText.toLowerCase();
    return dataSource.filter(row =>
      row.firstName.toLowerCase().includes(lowerSearch) ||
      row.lastName.toLowerCase().includes(lowerSearch) ||
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

  const uniqueServices = useMemo(() =>
    [...new Set(dataSource.map(item => item.serviceName))].filter(Boolean).map(text => ({ text, value: text })),
    [dataSource]
  );

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
        <span
          style={{
            cursor: 'pointer',
            color: '#007bff',
            textDecoration: 'underline',
            fontWeight: '500'
          }}
          onClick={() => {
            setSelectedCustomerId(record.customerId);
            setShowEntryModal(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedCustomerId(record.customerId);
              setShowEntryModal(true);
            }
          }}
          title="Click to view customer details"
          aria-label={`View details for ${text}`}
        >
          {text || 'N/A'}
        </span>
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
      width: 140,
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
      width: 110,
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
      render: (_, record) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
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
            style={{
              fontSize: '12px',
              padding: '6px 14px',
              whiteSpace: 'nowrap',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(0, 123, 255, 0.2)'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 8px rgba(0, 123, 255, 0.3)';
              e.target.style.background = '#0056b3';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 2px 4px rgba(0, 123, 255, 0.2)';
              e.target.style.background = '#007bff';
            }}
          >
            ✏️ Edit
          </button>
          <button
            onClick={() => onAddService && onAddService(record.customer)}
            style={{
              fontSize: '12px',
              padding: '6px 14px',
              whiteSpace: 'nowrap',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(40, 167, 69, 0.2)'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 8px rgba(40, 167, 69, 0.3)';
              e.target.style.background = '#1e7e34';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 2px 4px rgba(40, 167, 69, 0.2)';
              e.target.style.background = '#28a745';
            }}
          >
            ➕ Add
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Table
        dataSource={filteredData}
        columns={columns}
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
        scroll={{ x: true }}
        tableLayout="auto"
        summary={(pageData) => {
          // Calculate current page totals from pageData
          const pageTotals = pageData.reduce((acc, row) => {
            acc.amountBilled += row.amountBilled || 0;
            acc.amountPaid += row.amountPaid || 0;
            return acc;
          }, { amountBilled: 0, amountPaid: 0 });
          pageTotals.totalDue = pageTotals.amountBilled - pageTotals.amountPaid;

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
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />

      {showEntryModal && (
        <CustomerEntryModal
          customerId={selectedCustomerId}
          onClose={() => {
            setShowEntryModal(false);
            setSelectedCustomerId(null);
          }}
        />
      )}
    </div>
  );
}