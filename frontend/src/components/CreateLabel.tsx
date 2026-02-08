import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Package, Truck, CheckCircle, AlertCircle, Ruler, Plus, MapPin, Save, X, ChevronDown, Shield } from 'lucide-react'
import { getSettings, createLabel, getSavedAddresses, addSavedAddress, type Address, type Settings, type SavedAddress, type SavedAddresses } from '../api/client'

// State passed from Dashboard for return labels
interface ReturnLabelState {
  returnLabel: boolean
  fromAddress: {
    name: string
    street1: string
    street2: string
    city: string
    state: string
    zip: string
    phone: string
  }
  toAddress: {
    name: string
    street1: string
    street2: string
    city: string
    state: string
    zip: string
    phone: string
  }
  parcel: {
    weight: number
    length: number | null
    width: number | null
    height: number | null
    predefined: string | null
  }
  method: string
}

interface FormData {
  to_name: string
  to_street1: string
  to_street2: string
  to_city: string
  to_state: string
  to_zip: string
  to_phone: string
  parcel_mode: 'preset' | 'custom'
  parcel_preset: string
  custom_length: string
  custom_width: string
  custom_height: string
  custom_weight: string
  add_insurance: boolean
  insurance_amount: string
}

interface NewAddressForm {
  key: string
  label: string
  name: string
  street1: string
  street2: string
  city: string
  state: string
  zip: string
  phone: string
}

const initialFormData: FormData = {
  to_name: '',
  to_street1: '',
  to_street2: '',
  to_city: '',
  to_state: '',
  to_zip: '',
  to_phone: '',
  parcel_mode: 'preset',
  parcel_preset: 'card',
  custom_length: '',
  custom_width: '',
  custom_height: '',
  custom_weight: '',
  add_insurance: false,
  insurance_amount: '',
}

const emptyNewAddress: NewAddressForm = {
  key: '',
  label: '',
  name: '',
  street1: '',
  street2: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
}

export default function CreateLabel() {
  const location = useLocation()
  const returnState = location.state as ReturnLabelState | null

  const [settings, setSettings] = useState<Settings | null>(null)
  const [savedAddresses, setSavedAddresses] = useState<SavedAddresses>({})
  const [selectedAddressKey, setSelectedAddressKey] = useState<string>('default')
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ label_url: string; tracking_code: string; cost: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // New address modal state
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [newAddressForm, setNewAddressForm] = useState<NewAddressForm>(emptyNewAddress)
  const [savingAddress, setSavingAddress] = useState(false)
  const [showAddressDropdown, setShowAddressDropdown] = useState(false)

  // Custom from address for return labels
  const [customFromAddress, setCustomFromAddress] = useState<Address | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [settingsData, addressesData] = await Promise.all([
          getSettings(),
          getSavedAddresses()
        ])
        setSettings(settingsData)
        setSavedAddresses(addressesData)
      } catch (err) {
        console.error('Failed to load data:', err)
      }
    }
    fetchData()
  }, [])

  // Prefill form data from return label state
  useEffect(() => {
    if (returnState?.returnLabel) {
      // Set custom from address (original recipient becomes sender)
      setCustomFromAddress({
        name: returnState.fromAddress.name,
        street1: returnState.fromAddress.street1,
        street2: returnState.fromAddress.street2,
        city: returnState.fromAddress.city,
        state: returnState.fromAddress.state,
        zip: returnState.fromAddress.zip,
        phone: returnState.fromAddress.phone,
        country: 'US',
      })
      setSelectedAddressKey('_return_custom')

      // Set to address (original sender becomes recipient)
      const toAddr = returnState.toAddress
      const parcel = returnState.parcel

      // Determine parcel mode and values
      const hasCustomDimensions = parcel.length && parcel.width && parcel.height

      setFormData({
        to_name: toAddr.name,
        to_street1: toAddr.street1,
        to_street2: toAddr.street2 || '',
        to_city: toAddr.city,
        to_state: toAddr.state,
        to_zip: toAddr.zip,
        to_phone: toAddr.phone || '',
        parcel_mode: hasCustomDimensions ? 'custom' : 'preset',
        parcel_preset: returnState.method === 'card' ? 'card' : 'standard',
        custom_length: parcel.length?.toString() || '',
        custom_width: parcel.width?.toString() || '',
        custom_height: parcel.height?.toString() || '',
        custom_weight: parcel.weight?.toString() || '',
        add_insurance: false,
        insurance_amount: '',
      })
    }
  }, [returnState])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleNewAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setNewAddressForm(prev => ({ ...prev, [name]: value }))
  }

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingAddress(true)

    try {
      const address: SavedAddress = {
        label: newAddressForm.label,
        name: newAddressForm.name,
        street1: newAddressForm.street1,
        street2: newAddressForm.street2,
        city: newAddressForm.city,
        state: newAddressForm.state,
        zip: newAddressForm.zip,
        country: 'US',
        phone: newAddressForm.phone,
      }

      const result = await addSavedAddress(newAddressForm.key, address)
      setSavedAddresses(result.addresses)
      setSelectedAddressKey(newAddressForm.key)
      setShowAddressModal(false)
      setNewAddressForm(emptyNewAddress)
    } catch (err: any) {
      console.error('Failed to save address:', err)
      alert(err.response?.data?.detail || 'Failed to save address')
    } finally {
      setSavingAddress(false)
    }
  }

  // Get the currently selected from address
  const selectedAddress = selectedAddressKey === '_return_custom'
    ? customFromAddress
    : (savedAddresses[selectedAddressKey] || settings?.default_from_address)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const toAddress: Address = {
        name: formData.to_name,
        street1: formData.to_street1,
        street2: formData.to_street2,
        city: formData.to_city,
        state: formData.to_state,
        zip: formData.to_zip,
        phone: formData.to_phone || '000-000-0000',
        country: 'US',
      }

      // Build request based on mode
      let request: any = { to_address: toAddress }

      // Add from address if not using default
      if (selectedAddressKey === '_return_custom' && customFromAddress) {
        // For return labels, use the custom from address directly
        request.from_address = customFromAddress
      } else if (selectedAddress && selectedAddressKey !== 'default') {
        const { label, ...fromAddressData } = selectedAddress as SavedAddress
        request.from_address = fromAddressData
      }

      if (formData.parcel_mode === 'custom') {
        request.custom_parcel = {
          length: parseFloat(formData.custom_length),
          width: parseFloat(formData.custom_width),
          height: parseFloat(formData.custom_height),
          weight: parseFloat(formData.custom_weight),
        }
      } else {
        request.parcel_type = formData.parcel_preset
      }

      // Add insurance if enabled
      if (formData.add_insurance && formData.insurance_amount) {
        request.insurance_amount = parseFloat(formData.insurance_amount)
      }

      const result = await createLabel(request)

      setSuccess({
        label_url: result.label_url,
        tracking_code: result.tracking_code,
        cost: result.cost,
      })
      setFormData(initialFormData)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create label')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          {returnState?.returnLabel ? 'Create Return Label' : 'Create Shipping Label'}
        </h1>
        <p className="text-dark-400 mt-1">
          {returnState?.returnLabel
            ? 'Create a return label with addresses swapped from original shipment'
            : 'Create a new shipping label with prefilled sender info'}
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-green-400">Label Created Successfully!</h3>
              <p className="text-dark-300 mt-1">
                Tracking: <span className="font-mono">{success.tracking_code}</span>
              </p>
              <p className="text-dark-300">
                Cost: <span className="text-green-400 font-medium">${success.cost.toFixed(2)}</span>
              </p>
              <a
                href={success.label_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <Package className="w-4 h-4" />
                Download Label
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-red-400">Error Creating Label</h3>
              <p className="text-dark-300 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* From Address with Selection */}
        <div className="bg-dark-900 rounded-xl border border-dark-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-500" />
              From Address (Sender)
            </h2>
            <button
              onClick={() => setShowAddressModal(true)}
              className="flex items-center gap-1 px-2 py-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add New
            </button>
          </div>

          {/* Address Selector */}
          <div className="relative mb-4">
            <button
              onClick={() => !customFromAddress && setShowAddressDropdown(!showAddressDropdown)}
              disabled={!!customFromAddress}
              className={`w-full flex items-center justify-between px-4 py-3 bg-dark-800 border border-dark-700 rounded-lg text-white transition-colors ${
                customFromAddress ? 'cursor-default' : 'hover:border-dark-600'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-blue-400 font-medium">
                  {customFromAddress
                    ? 'Return Address (from original shipment)'
                    : (savedAddresses[selectedAddressKey]?.label || 'Default Address')}
                </span>
              </span>
              {!customFromAddress && (
                <ChevronDown className={`w-5 h-5 text-dark-400 transition-transform ${showAddressDropdown ? 'rotate-180' : ''}`} />
              )}
            </button>

            {/* Dropdown */}
            {showAddressDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-dark-800 border border-dark-700 rounded-lg shadow-xl overflow-hidden">
                {Object.entries(savedAddresses).map(([key, addr]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedAddressKey(key)
                      setShowAddressDropdown(false)
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-dark-700 transition-colors ${
                      selectedAddressKey === key ? 'bg-dark-700 border-l-2 border-blue-500' : ''
                    }`}
                  >
                    <p className="text-white font-medium">{addr.label}</p>
                    <p className="text-dark-400 text-sm">{addr.name} - {addr.city}, {addr.state}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Address Details */}
          {selectedAddress ? (
            <div className="space-y-2 text-dark-300 bg-dark-800 rounded-lg p-4">
              <p className="font-medium text-white">{selectedAddress.name}</p>
              <p>{selectedAddress.street1}</p>
              {selectedAddress.street2 && <p>{selectedAddress.street2}</p>}
              <p>{selectedAddress.city}, {selectedAddress.state} {selectedAddress.zip}</p>
              {selectedAddress.phone && <p className="text-dark-400 text-sm">{selectedAddress.phone}</p>}
            </div>
          ) : (
            <p className="text-dark-400">Loading addresses...</p>
          )}
        </div>

        {/* To Address Form */}
        <form onSubmit={handleSubmit} className="bg-dark-900 rounded-xl border border-dark-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Truck className="w-5 h-5 text-green-500" />
            To Address (Recipient)
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-dark-400 text-sm mb-1">Full Name *</label>
              <input
                type="text"
                name="to_name"
                value={formData.to_name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-dark-400 text-sm mb-1">Street Address *</label>
              <input
                type="text"
                name="to_street1"
                value={formData.to_street1}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                placeholder="123 Main St"
              />
            </div>

            <div>
              <label className="block text-dark-400 text-sm mb-1">Apt/Suite (optional)</label>
              <input
                type="text"
                name="to_street2"
                value={formData.to_street2}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                placeholder="Apt 4B"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="block text-dark-400 text-sm mb-1">City *</label>
                <input
                  type="text"
                  name="to_city"
                  value={formData.to_city}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                  placeholder="New York"
                />
              </div>
              <div>
                <label className="block text-dark-400 text-sm mb-1">State *</label>
                <input
                  type="text"
                  name="to_state"
                  value={formData.to_state}
                  onChange={handleChange}
                  required
                  maxLength={2}
                  className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white uppercase"
                  placeholder="NY"
                />
              </div>
              <div>
                <label className="block text-dark-400 text-sm mb-1">ZIP *</label>
                <input
                  type="text"
                  name="to_zip"
                  value={formData.to_zip}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                  placeholder="10001"
                />
              </div>
            </div>

            <div>
              <label className="block text-dark-400 text-sm mb-1">Phone (optional)</label>
              <input
                type="tel"
                name="to_phone"
                value={formData.to_phone}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                placeholder="555-555-5555"
              />
            </div>

            {/* Parcel Mode Selection */}
            <div>
              <label className="block text-dark-400 text-sm mb-2">Package Configuration *</label>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    formData.parcel_mode === 'preset'
                      ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                      : 'bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="parcel_mode"
                    value="preset"
                    checked={formData.parcel_mode === 'preset'}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  <Package className="w-5 h-5" />
                  <span className="font-medium">Use Preset</span>
                </label>
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    formData.parcel_mode === 'custom'
                      ? 'bg-purple-500/10 border-purple-500 text-purple-400'
                      : 'bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="parcel_mode"
                    value="custom"
                    checked={formData.parcel_mode === 'custom'}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  <Ruler className="w-5 h-5" />
                  <span className="font-medium">Custom Dimensions</span>
                </label>
              </div>

              {/* Preset Selection */}
              {formData.parcel_mode === 'preset' && settings?.parcel_presets && (
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(settings.parcel_presets).map(([key, preset]) => (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                        formData.parcel_preset === key
                          ? 'bg-green-500/10 border-green-500 text-green-400'
                          : 'bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="parcel_preset"
                        value={key}
                        checked={formData.parcel_preset === key}
                        onChange={handleChange}
                        className="sr-only"
                      />
                      <div>
                        <p className="font-medium">{preset.name}</p>
                        <p className="text-xs text-dark-400">
                          {preset.predefined_package
                            ? `${preset.predefined_package}, ${preset.weight}oz`
                            : `${preset.length}"x${preset.width}"x${preset.height}", ${preset.weight}oz`
                          }
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Custom Dimensions */}
              {formData.parcel_mode === 'custom' && (
                <div className="space-y-3 bg-dark-800 rounded-lg p-4 border border-dark-700">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-dark-400 text-xs mb-1">Length (in) *</label>
                      <input
                        type="number"
                        step="0.01"
                        name="custom_length"
                        value={formData.custom_length}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm"
                        placeholder="6"
                      />
                    </div>
                    <div>
                      <label className="block text-dark-400 text-xs mb-1">Width (in) *</label>
                      <input
                        type="number"
                        step="0.01"
                        name="custom_width"
                        value={formData.custom_width}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm"
                        placeholder="4.5"
                      />
                    </div>
                    <div>
                      <label className="block text-dark-400 text-xs mb-1">Height (in) *</label>
                      <input
                        type="number"
                        step="0.01"
                        name="custom_height"
                        value={formData.custom_height}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm"
                        placeholder="0.5"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-dark-400 text-xs mb-1">Weight (oz) *</label>
                    <input
                      type="number"
                      step="0.1"
                      name="custom_weight"
                      value={formData.custom_weight}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm"
                      placeholder="5"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Insurance Option */}
            <div>
              <label className="block text-dark-400 text-sm mb-2">Shipping Insurance (optional)</label>
              <label
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  formData.add_insurance
                    ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400'
                    : 'bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600'
                }`}
              >
                <input
                  type="checkbox"
                  name="add_insurance"
                  checked={formData.add_insurance}
                  onChange={(e) => setFormData(prev => ({ ...prev, add_insurance: e.target.checked }))}
                  className="sr-only"
                />
                <Shield className="w-5 h-5" />
                <div className="flex-1">
                  <span className="font-medium">Add Insurance</span>
                  <p className="text-xs text-dark-400">Protect your shipment against loss or damage</p>
                </div>
              </label>

              {formData.add_insurance && (
                <div className="mt-3 bg-dark-800 rounded-lg p-4 border border-dark-700">
                  <label className="block text-dark-400 text-xs mb-1">Declared Value ($) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name="insurance_amount"
                      value={formData.insurance_amount}
                      onChange={handleChange}
                      required={formData.add_insurance}
                      className="w-full pl-7 pr-4 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm"
                      placeholder="100.00"
                    />
                  </div>
                  <p className="text-dark-500 text-xs mt-2">
                    Enter the value of the items you're shipping. Insurance cost is typically 1-2% of declared value.
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Creating Label...
                </>
              ) : (
                <>
                  <Package className="w-5 h-5" />
                  Create & Purchase Label
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Add New Address Modal */}
      {showAddressModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-900 rounded-xl border border-dark-800 p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-500" />
                Add New Sender Address
              </h3>
              <button
                onClick={() => {
                  setShowAddressModal(false)
                  setNewAddressForm(emptyNewAddress)
                }}
                className="text-dark-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAddress} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-dark-400 text-sm mb-1">Unique Key *</label>
                  <input
                    type="text"
                    name="key"
                    value={newAddressForm.key}
                    onChange={handleNewAddressChange}
                    required
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm"
                    placeholder="warehouse"
                  />
                  <p className="text-dark-500 text-xs mt-1">No spaces, lowercase</p>
                </div>
                <div>
                  <label className="block text-dark-400 text-sm mb-1">Display Label *</label>
                  <input
                    type="text"
                    name="label"
                    value={newAddressForm.label}
                    onChange={handleNewAddressChange}
                    required
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm"
                    placeholder="Main Warehouse"
                  />
                </div>
              </div>

              <div>
                <label className="block text-dark-400 text-sm mb-1">Contact Name *</label>
                <input
                  type="text"
                  name="name"
                  value={newAddressForm.name}
                  onChange={handleNewAddressChange}
                  required
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm"
                  placeholder="Business Name or Personal Name"
                />
              </div>

              <div>
                <label className="block text-dark-400 text-sm mb-1">Street Address *</label>
                <input
                  type="text"
                  name="street1"
                  value={newAddressForm.street1}
                  onChange={handleNewAddressChange}
                  required
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm"
                  placeholder="123 Main St"
                />
              </div>

              <div>
                <label className="block text-dark-400 text-sm mb-1">Street Address 2</label>
                <input
                  type="text"
                  name="street2"
                  value={newAddressForm.street2}
                  onChange={handleNewAddressChange}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm"
                  placeholder="Suite 100"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-dark-400 text-sm mb-1">City *</label>
                  <input
                    type="text"
                    name="city"
                    value={newAddressForm.city}
                    onChange={handleNewAddressChange}
                    required
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm"
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block text-dark-400 text-sm mb-1">State *</label>
                  <input
                    type="text"
                    name="state"
                    value={newAddressForm.state}
                    onChange={handleNewAddressChange}
                    required
                    maxLength={2}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm uppercase"
                    placeholder="PA"
                  />
                </div>
                <div>
                  <label className="block text-dark-400 text-sm mb-1">ZIP *</label>
                  <input
                    type="text"
                    name="zip"
                    value={newAddressForm.zip}
                    onChange={handleNewAddressChange}
                    required
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm"
                    placeholder="12345"
                  />
                </div>
              </div>

              <div>
                <label className="block text-dark-400 text-sm mb-1">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={newAddressForm.phone}
                  onChange={handleNewAddressChange}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm"
                  placeholder="555-555-5555"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddressModal(false)
                    setNewAddressForm(emptyNewAddress)
                  }}
                  className="flex-1 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAddress}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingAddress ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Address
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
