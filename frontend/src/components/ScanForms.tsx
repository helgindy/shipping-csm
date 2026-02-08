import { useState, useEffect } from 'react'
import { FileText, RefreshCw, ExternalLink, Download } from 'lucide-react'
import { getScanForms, syncScanForms, type ScanFormItem } from '../api/client'

export default function ScanForms() {
  const [scanforms, setScanforms] = useState<ScanFormItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetchData = async () => {
    try {
      const data = await getScanForms()
      setScanforms(data.scanforms)
    } catch (error) {
      console.error('Error fetching scan forms:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await syncScanForms()
      alert(`Synced ${result.imported} new scan forms from EasyPost`)
      fetchData()
    } catch (error) {
      console.error('Sync error:', error)
      alert('Failed to sync scan forms')
    } finally {
      setSyncing(false)
    }
  }

  const handleOpenForm = (url: string) => {
    window.open(url, '_blank')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Scan Forms</h1>
          <p className="text-dark-400 mt-1">USPS scan forms for batch shipment drop-off</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-dark-800 hover:bg-dark-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync from EasyPost'}
        </button>
      </div>

      {/* Info Card */}
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-purple-400 mt-0.5" />
          <div>
            <p className="text-purple-300 font-medium">What is a Scan Form?</p>
            <p className="text-dark-400 text-sm mt-1">
              A USPS Scan Form (also known as a SCAN form) allows you to drop off multiple packages at once.
              Instead of having each package scanned individually, you present one form and all packages are
              accepted together.
            </p>
          </div>
        </div>
      </div>

      {/* Scan Forms Table */}
      <div className="bg-dark-900 rounded-xl border border-dark-800">
        <div className="p-4 border-b border-dark-800">
          <h2 className="text-lg font-semibold text-white">All Scan Forms</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-800">
                <th className="text-left px-4 py-3 text-dark-400 font-medium text-sm">ID</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium text-sm">Status</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium text-sm">Shipments</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium text-sm">Created</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {scanforms.map((scanform) => (
                <tr
                  key={scanform.id}
                  className="border-b border-dark-800/50 table-row-hover"
                >
                  <td className="px-4 py-3">
                    <span className="text-dark-300 font-mono text-sm">{scanform.easypost_id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      scanform.status === 'created'
                        ? 'bg-green-500/20 text-green-400'
                        : scanform.status === 'creating'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {scanform.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-white font-medium">{scanform.shipment_count}</span>
                    <span className="text-dark-400 text-sm ml-1">packages</span>
                  </td>
                  <td className="px-4 py-3 text-dark-400 text-sm">
                    {new Date(scanform.created_at).toLocaleDateString()}{' '}
                    {new Date(scanform.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {scanform.form_url && (
                        <>
                          <button
                            onClick={() => handleOpenForm(scanform.form_url)}
                            className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm"
                            title="View scan form PDF"
                          >
                            <ExternalLink className="w-4 h-4" />
                            View
                          </button>
                          <a
                            href={scanform.form_url}
                            download
                            className="flex items-center gap-1 text-green-400 hover:text-green-300 text-sm"
                            title="Download scan form PDF"
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </a>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {scanforms.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-dark-400">
                    No scan forms found. Create one from the Dashboard by selecting tracked shipments.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tracking Codes Expansion - Optional Feature */}
      {scanforms.length > 0 && (
        <div className="bg-dark-900 rounded-xl border border-dark-800 p-4">
          <h3 className="text-white font-medium mb-3">Recent Scan Form Details</h3>
          <div className="space-y-3">
            {scanforms.slice(0, 3).map((scanform) => (
              <div key={scanform.id} className="bg-dark-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-dark-300 font-mono text-sm">{scanform.easypost_id}</span>
                  <span className="text-dark-400 text-xs">
                    {scanform.tracking_codes.length} tracking numbers
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {scanform.tracking_codes.slice(0, 5).map((code) => (
                    <span
                      key={code}
                      className="px-2 py-1 bg-dark-700 rounded text-xs text-dark-300 font-mono"
                    >
                      {code}
                    </span>
                  ))}
                  {scanform.tracking_codes.length > 5 && (
                    <span className="px-2 py-1 text-xs text-dark-400">
                      +{scanform.tracking_codes.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
