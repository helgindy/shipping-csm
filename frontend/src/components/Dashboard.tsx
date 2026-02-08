import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, DollarSign, TrendingUp, RefreshCw, Upload, Search, Printer, CheckSquare, Square, X, RotateCcw, FileText, Filter, ExternalLink, Copy, Check } from 'lucide-react'
import { getShipments, getShipmentStats, syncShipments, uploadBulkLabels, createScanForm, type DashboardStats, type Shipment, type ShipmentFilters } from '../api/client'

function StatCard({ title, value, subtitle, icon: Icon, color }: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-dark-900 rounded-xl p-6 border border-dark-800">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-dark-400 text-sm">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {subtitle && <p className="text-dark-500 text-xs mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [printing, setPrinting] = useState<number | null>(null)

  // Filter state
  const [filters, setFilters] = useState<ShipmentFilters>({})
  const hasActiveFilters = !!(filters.method || filters.carrier || filters.manifested)

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [printingMultiple, setPrintingMultiple] = useState(false)

  // ScanForm state
  const [scanFormMode, setScanFormMode] = useState(false)
  const [scanFormSelectedIds, setScanFormSelectedIds] = useState<Set<number>>(new Set())
  const [creatingScanForm, setCreatingScanForm] = useState(false)
  const [, setScanFormResult] = useState<{ form_url: string; tracking_codes: string[] } | null>(null)

  // Copy to clipboard state
  const [copiedTrackingCode, setCopiedTrackingCode] = useState<string | null>(null)

  // Open tracking URL based on carrier
  const getTrackingUrl = (shipment: Shipment): string | null => {
    if (!shipment.tracking_code) return null

    const carrier = shipment.carrier.toUpperCase()
    const trackingCode = shipment.tracking_code

    if (carrier === 'USPS') {
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingCode}`
    } else if (carrier === 'UPS') {
      return `https://www.ups.com/track?tracknum=${trackingCode}`
    } else if (carrier === 'FEDEX') {
      return `https://www.fedex.com/fedextrack/?trknbr=${trackingCode}`
    }
    return null
  }

  const handleOpenTracking = (shipment: Shipment) => {
    const url = getTrackingUrl(shipment)
    if (url) {
      window.open(url, '_blank')
    }
  }

  // Copy tracking code to clipboard
  const handleCopyTrackingCode = async (trackingCode: string) => {
    try {
      await navigator.clipboard.writeText(trackingCode)
      setCopiedTrackingCode(trackingCode)
      // Reset after 2 seconds
      setTimeout(() => setCopiedTrackingCode(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Create return label - swap from/to addresses
  const handleCreateReturn = (shipment: Shipment) => {
    navigate('/create', {
      state: {
        returnLabel: true,
        // For return: original "to" becomes new "from", original "from" becomes new "to"
        fromAddress: {
          name: shipment.to_name,
          street1: shipment.to_street1,
          street2: shipment.to_street2 || '',
          city: shipment.to_city,
          state: shipment.to_state,
          zip: shipment.to_zip,
          phone: shipment.to_phone || '',
        },
        toAddress: {
          name: shipment.from_name,
          street1: shipment.from_street1,
          street2: shipment.from_street2 || '',
          city: shipment.from_city,
          state: shipment.from_state,
          zip: shipment.from_zip,
          phone: shipment.from_phone || '',
        },
        parcel: {
          weight: shipment.parcel_weight,
          length: shipment.parcel_length,
          width: shipment.parcel_width,
          height: shipment.parcel_height,
          predefined: shipment.parcel_predefined,
        },
        method: shipment.method,
      }
    })
  }

  // Print label with rotation for card labels (uses backend to fetch and rotate)
  const handlePrintLabel = async (shipment: Shipment) => {
    setPrinting(shipment.id)

    try {
      // Use backend endpoint to get rotated label image
      const labelUrl = `/api/labels/print/${shipment.id}?rotate=true`

      // Create print window
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        alert('Please allow popups to print labels')
        setPrinting(null)
        return
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print Label - ${shipment.tracking_code}</title>
          <style>
            @media print {
              @page {
                size: auto;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
              }
            }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              background: white;
            }
            img {
              max-width: 100%;
              max-height: 100vh;
              object-fit: contain;
            }
            .loading {
              font-family: sans-serif;
              color: #666;
            }
          </style>
        </head>
        <body>
          <p class="loading">Loading label...</p>
          <img
            src="${labelUrl}"
            style="display: none;"
            onload="this.previousElementSibling.style.display='none'; this.style.display='block'; window.print(); window.close();"
            onerror="this.previousElementSibling.textContent='Failed to load label. Please try again.';"
          />
        </body>
        </html>
      `)
      printWindow.document.close()

      setPrinting(null)
    } catch (error) {
      console.error('Print error:', error)
      alert('Failed to print label')
      setPrinting(null)
    }
  }

  // Toggle selection for a single shipment
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  // Select all visible shipments
  const selectAll = () => {
    setSelectedIds(new Set(shipments.map(s => s.id)))
  }

  // Clear all selections
  const clearSelection = () => {
    setSelectedIds(new Set())
    setSelectMode(false)
  }

  // ScanForm functions - only include tracked shipments that haven't been manifested yet
  const eligibleForScanForm = shipments.filter(s => s.method !== 'card' && !s.manifested)

  const toggleScanFormSelect = (id: number) => {
    // Prevent selecting already manifested shipments
    const shipment = shipments.find(s => s.id === id)
    if (shipment?.manifested) return

    setScanFormSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const selectAllTracked = () => {
    // Only select shipments that are tracked AND not already manifested
    setScanFormSelectedIds(new Set(eligibleForScanForm.map(s => s.id)))
  }

  const clearScanFormSelection = () => {
    setScanFormSelectedIds(new Set())
    setScanFormMode(false)
    setScanFormResult(null)
  }

  const handleCreateScanForm = async () => {
    if (scanFormSelectedIds.size === 0) return

    setCreatingScanForm(true)
    try {
      const result = await createScanForm(Array.from(scanFormSelectedIds))
      setScanFormResult({
        form_url: result.form_url,
        tracking_codes: result.tracking_codes,
      })
      // Open the scan form in a new tab
      window.open(result.form_url, '_blank')
    } catch (error: any) {
      console.error('ScanForm error:', error)
      alert(error.response?.data?.detail || 'Failed to create ScanForm')
    } finally {
      setCreatingScanForm(false)
    }
  }

  // Print all selected labels
  const handlePrintSelected = async () => {
    if (selectedIds.size === 0) return

    setPrintingMultiple(true)

    // Get selected shipments in order
    const selectedShipments = shipments.filter(s => selectedIds.has(s.id))

    // Build HTML with all labels
    const labelImages = selectedShipments.map(shipment => {
      const labelUrl = `/api/labels/print/${shipment.id}?rotate=true`
      return `
        <div class="label-page">
          <img src="${labelUrl}" />
        </div>
      `
    }).join('')

    // Create print window with all labels
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('Please allow popups to print labels')
      setPrintingMultiple(false)
      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print ${selectedShipments.length} Labels</title>
        <style>
          @media print {
            @page {
              size: auto;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
            }
            .label-page {
              page-break-after: always;
              page-break-inside: avoid;
            }
            .label-page:last-child {
              page-break-after: auto;
            }
          }
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          .label-page {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 10px;
            box-sizing: border-box;
          }
          .label-page img {
            max-width: 100%;
            max-height: 95vh;
            object-fit: contain;
          }
          .loading {
            font-family: sans-serif;
            color: #666;
            text-align: center;
            padding: 20px;
          }
          .status {
            position: fixed;
            top: 10px;
            left: 10px;
            background: #333;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            font-family: sans-serif;
            z-index: 1000;
          }
        </style>
      </head>
      <body>
        <div class="status" id="status">Loading ${selectedShipments.length} labels...</div>
        ${labelImages}
        <script>
          let loaded = 0;
          const total = ${selectedShipments.length};
          const images = document.querySelectorAll('img');
          const status = document.getElementById('status');

          images.forEach(img => {
            img.onload = () => {
              loaded++;
              status.textContent = 'Loaded ' + loaded + ' of ' + total + ' labels...';
              if (loaded === total) {
                status.textContent = 'All labels loaded! Printing...';
                setTimeout(() => {
                  status.style.display = 'none';
                  window.print();
                  window.close();
                }, 500);
              }
            };
            img.onerror = () => {
              loaded++;
              img.parentElement.innerHTML = '<p style="color: red;">Failed to load label</p>';
              if (loaded === total) {
                status.textContent = 'Some labels failed. Printing available labels...';
                setTimeout(() => {
                  status.style.display = 'none';
                  window.print();
                  window.close();
                }, 500);
              }
            };
          });
        </script>
      </body>
      </html>
    `)
    printWindow.document.close()

    setPrintingMultiple(false)
    clearSelection()
  }

  const fetchData = async () => {
    try {
      const [statsData, shipmentsData] = await Promise.all([
        getShipmentStats(),
        getShipments(page, 20, { search, ...filters })
      ])
      setStats(statsData)
      setShipments(shipmentsData.shipments)
      setTotalPages(shipmentsData.total_pages)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [page, search, filters])

  // Filter toggle functions
  const toggleMethodFilter = (method: string) => {
    setFilters((prev: ShipmentFilters) => ({
      ...prev,
      method: prev.method === method ? undefined : method
    }))
    setPage(1)
  }

  const toggleCarrierFilter = (carrier: string) => {
    setFilters((prev: ShipmentFilters) => ({
      ...prev,
      carrier: prev.carrier === carrier ? undefined : carrier
    }))
    setPage(1)
  }

  const toggleManifestedFilter = (value: 'yes' | 'no') => {
    setFilters((prev: ShipmentFilters) => ({
      ...prev,
      manifested: prev.manifested === value ? undefined : value
    }))
    setPage(1)
  }

  const clearAllFilters = () => {
    setFilters({})
    setPage(1)
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await syncShipments()
      alert(`Synced ${result.imported} shipments from EasyPost`)
      fetchData()
    } catch (error) {
      console.error('Sync error:', error)
      alert('Failed to sync shipments')
    } finally {
      setSyncing(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const result = await uploadBulkLabels(file)
      alert(`Created ${result.results.length} labels. Total cost: $${result.total_cost}`)
      fetchData()
    } catch (error) {
      console.error('Upload error:', error)
      alert('Failed to create labels from CSV')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-dark-400 mt-1">Overview of your shipping activity</p>
        </div>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload CSV'}
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-dark-800 hover:bg-dark-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync from EasyPost'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Shipments"
            value={stats.total_shipments}
            subtitle={`${stats.card_shipments} card, ${stats.tracked_shipments} tracked`}
            icon={Package}
            color="bg-blue-600"
          />
          <StatCard
            title="Total Spent"
            value={`$${stats.total_cost.toFixed(2)}`}
            icon={DollarSign}
            color="bg-green-600"
          />
          <StatCard
            title="This Week"
            value={stats.shipments_this_week}
            subtitle={`$${stats.cost_this_week.toFixed(2)} spent`}
            icon={TrendingUp}
            color="bg-purple-600"
          />
          <StatCard
            title="Today"
            value={stats.shipments_today}
            subtitle={`$${stats.cost_today.toFixed(2)} spent`}
            icon={Package}
            color="bg-orange-600"
          />
        </div>
      )}

      {/* Shipments Table */}
      <div className="bg-dark-900 rounded-xl border border-dark-800">
        <div className="p-4 border-b border-dark-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">Recent Shipments</h2>
            {!selectMode && !scanFormMode ? (
              <>
                <button
                  onClick={() => setSelectMode(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white text-sm rounded-lg transition-colors"
                >
                  <CheckSquare className="w-4 h-4" />
                  Print Multiple
                </button>
                <button
                  onClick={() => setScanFormMode(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white text-sm rounded-lg transition-colors"
                  title="Create USPS ScanForm for tracked shipments"
                >
                  <FileText className="w-4 h-4" />
                  Create ScanForm
                </button>
              </>
            ) : selectMode ? (
              <div className="flex items-center gap-2">
                <span className="text-dark-400 text-sm">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={selectAll}
                  className="px-2 py-1 text-xs bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white rounded transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={handlePrintSelected}
                  disabled={selectedIds.size === 0 || printingMultiple}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {printingMultiple ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  Print Selected
                </button>
                <button
                  onClick={clearSelection}
                  className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded transition-colors"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-dark-400 text-sm">
                  <FileText className="w-4 h-4 inline mr-1" />
                  {scanFormSelectedIds.size} of {eligibleForScanForm.length} eligible selected
                </span>
                <button
                  onClick={selectAllTracked}
                  disabled={eligibleForScanForm.length === 0}
                  className="px-2 py-1 text-xs bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white rounded transition-colors disabled:opacity-50"
                >
                  Select All Eligible
                </button>
                <button
                  onClick={handleCreateScanForm}
                  disabled={scanFormSelectedIds.size === 0 || creatingScanForm}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingScanForm ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  Create ScanForm
                </button>
                <button
                  onClick={clearScanFormSelection}
                  className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded transition-colors"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              type="text"
              placeholder="Search shipments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white placeholder-dark-400 w-64"
            />
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-4 py-3 border-b border-dark-800 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-dark-400 text-sm">
            <Filter className="w-4 h-4" />
            <span>Filters:</span>
          </div>

          {/* Method Filters */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleMethodFilter('card')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filters.method === 'card'
                  ? 'bg-blue-500 text-white'
                  : 'bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              Card
            </button>
            <button
              onClick={() => toggleMethodFilter('tracked')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filters.method === 'tracked'
                  ? 'bg-purple-500 text-white'
                  : 'bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              Tracked
            </button>
          </div>

          <div className="w-px h-5 bg-dark-700" />

          {/* Carrier Filters */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleCarrierFilter('USPS')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filters.carrier === 'USPS'
                  ? 'bg-blue-600 text-white'
                  : 'bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              USPS
            </button>
            <button
              onClick={() => toggleCarrierFilter('UPS')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filters.carrier === 'UPS'
                  ? 'bg-amber-600 text-white'
                  : 'bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              UPS
            </button>
            <button
              onClick={() => toggleCarrierFilter('FedEx')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filters.carrier === 'FedEx'
                  ? 'bg-orange-600 text-white'
                  : 'bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              FedEx
            </button>
          </div>

          <div className="w-px h-5 bg-dark-700" />

          {/* Manifested Filters */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleManifestedFilter('yes')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filters.manifested === 'yes'
                  ? 'bg-green-600 text-white'
                  : 'bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              Manifested
            </button>
            <button
              onClick={() => toggleManifestedFilter('no')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filters.manifested === 'no'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              Not Manifested
            </button>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <>
              <div className="w-px h-5 bg-dark-700" />
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                <X className="w-3 h-3" />
                Clear Filters
              </button>
            </>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-800">
                {(selectMode || scanFormMode) && (
                  <th className="w-10 px-4 py-3">
                    {selectMode ? (
                      <button
                        onClick={() => selectedIds.size === shipments.length ? setSelectedIds(new Set()) : selectAll()}
                        className="text-dark-400 hover:text-white transition-colors"
                      >
                        {selectedIds.size === shipments.length && shipments.length > 0 ? (
                          <CheckSquare className="w-5 h-5 text-green-500" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => scanFormSelectedIds.size === eligibleForScanForm.length ? setScanFormSelectedIds(new Set()) : selectAllTracked()}
                        className="text-dark-400 hover:text-white transition-colors"
                        title="Select all eligible shipments (not already manifested)"
                      >
                        {scanFormSelectedIds.size === eligibleForScanForm.length && eligibleForScanForm.length > 0 ? (
                          <CheckSquare className="w-5 h-5 text-purple-500" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    )}
                  </th>
                )}
                <th className="text-left px-4 py-3 text-dark-400 font-medium text-sm">Recipient</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium text-sm">Tracking</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium text-sm">Carrier</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium text-sm">Method</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium text-sm">Cost</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium text-sm">Date</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((shipment) => {
                const isTracked = shipment.method !== 'card'
                const isManifested = !!shipment.manifested
                const isEligibleForScanForm = isTracked && !isManifested
                const isSelectedForPrint = selectedIds.has(shipment.id)
                const isSelectedForScanForm = scanFormSelectedIds.has(shipment.id)

                return (
                <tr
                  key={shipment.id}
                  className={`border-b border-dark-800/50 table-row-hover ${
                    selectMode ? 'cursor-pointer' : ''
                  } ${
                    scanFormMode && isEligibleForScanForm ? 'cursor-pointer' : ''
                  } ${
                    isSelectedForPrint ? 'bg-green-500/10' : ''
                  } ${
                    isSelectedForScanForm ? 'bg-purple-500/10' : ''
                  } ${
                    scanFormMode && !isEligibleForScanForm ? 'opacity-50' : ''
                  }`}
                  onClick={() => {
                    if (selectMode) toggleSelect(shipment.id)
                    else if (scanFormMode && isEligibleForScanForm) toggleScanFormSelect(shipment.id)
                  }}
                >
                  {(selectMode || scanFormMode) && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {selectMode ? (
                        <button
                          onClick={() => toggleSelect(shipment.id)}
                          className="text-dark-400 hover:text-white transition-colors"
                        >
                          {isSelectedForPrint ? (
                            <CheckSquare className="w-5 h-5 text-green-500" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      ) : isEligibleForScanForm ? (
                        <button
                          onClick={() => toggleScanFormSelect(shipment.id)}
                          className="text-dark-400 hover:text-white transition-colors"
                        >
                          {isSelectedForScanForm ? (
                            <CheckSquare className="w-5 h-5 text-purple-500" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      ) : isManifested ? (
                        <span className="text-dark-600" title="Already added to a scan form">
                          <CheckSquare className="w-5 h-5 text-dark-600" />
                        </span>
                      ) : (
                        <span className="text-dark-600" title="Only tracked shipments can be added to ScanForm">
                          <Square className="w-5 h-5" />
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-white font-medium">{shipment.to_name}</p>
                      <p className="text-dark-400 text-sm">{shipment.to_city}, {shipment.to_state}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {shipment.tracking_code ? (
                      <div className="flex items-center gap-1">
                        {shipment.method !== 'card' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenTracking(shipment); }}
                            className="flex items-center gap-1 text-dark-300 font-mono text-sm hover:text-blue-400 transition-colors"
                            title={`Track on ${shipment.carrier}`}
                          >
                            {shipment.tracking_code}
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-dark-300 font-mono text-sm">{shipment.tracking_code}</span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopyTrackingCode(shipment.tracking_code); }}
                          className={`p-1 rounded transition-colors ${
                            copiedTrackingCode === shipment.tracking_code
                              ? 'text-green-400'
                              : 'text-dark-500 hover:text-dark-300'
                          }`}
                          title={copiedTrackingCode === shipment.tracking_code ? 'Copied!' : 'Copy tracking number'}
                        >
                          {copiedTrackingCode === shipment.tracking_code ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-dark-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleCarrierFilter(shipment.carrier); }}
                      className={`text-dark-300 hover:text-white transition-colors ${
                        filters.carrier === shipment.carrier ? 'text-white font-medium' : ''
                      }`}
                      title={`Filter by ${shipment.carrier}`}
                    >
                      {shipment.carrier}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleMethodFilter(shipment.method); }}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                          shipment.method === 'card'
                            ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                            : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                        } ${filters.method === shipment.method ? 'ring-2 ring-white/50' : ''}`}
                        title={`Filter by ${shipment.method}`}
                      >
                        {shipment.method}
                      </button>
                      {isManifested && (
                        <button
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleManifestedFilter('yes'); }}
                          className={`px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors cursor-pointer ${
                            filters.manifested === 'yes' ? 'ring-2 ring-white/50' : ''
                          }`}
                          title="Filter by manifested"
                        >
                          manifested
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-green-400 font-medium">${shipment.cost.toFixed(2)}</td>
                  <td className="px-4 py-3 text-dark-400 text-sm">
                    {new Date(shipment.easypost_created_at || shipment.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePrintLabel(shipment); }}
                        disabled={printing === shipment.id}
                        className="flex items-center gap-1 text-green-400 hover:text-green-300 disabled:opacity-50"
                        title={shipment.method === 'card' ? 'Print rotated label' : 'Print label'}
                      >
                        {printing === shipment.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-400"></div>
                        ) : (
                          <Printer className="w-4 h-4" />
                        )}
                        Print
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCreateReturn(shipment); }}
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                        title="Create return label"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Return
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
              {shipments.length === 0 && (
                <tr>
                  <td colSpan={(selectMode || scanFormMode) ? 8 : 7} className="px-4 py-8 text-center text-dark-400">
                    No shipments found. Create a label or sync from EasyPost to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-dark-800 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 bg-dark-800 hover:bg-dark-700 text-white rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-dark-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 bg-dark-800 hover:bg-dark-700 text-white rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
