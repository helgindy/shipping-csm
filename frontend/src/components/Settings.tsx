import { useState, useEffect } from 'react'
import { Save, MapPin, Package, CheckCircle, AlertTriangle, Zap, Plus, Trash2, Edit2, X } from 'lucide-react'
import { getSettings, updateSettings, switchApiEnvironment, addParcelPreset, updateParcelPreset, deleteParcelPreset, type Settings as SettingsType, type Address, type ParcelPreset } from '../api/client'

interface PresetFormData {
  key: string
  name: string
  predefined_package: string
  length: string
  width: string
  height: string
  weight: string
}

const emptyPresetForm: PresetFormData = {
  key: '',
  name: '',
  predefined_package: '',
  length: '',
  width: '',
  height: '',
  weight: '',
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [switchingEnv, setSwitchingEnv] = useState(false)
  const [formData, setFormData] = useState<Address>({
    name: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    phone: '',
  })

  // Parcel preset state
  const [showPresetModal, setShowPresetModal] = useState(false)
  const [editingPresetKey, setEditingPresetKey] = useState<string | null>(null)
  const [presetForm, setPresetForm] = useState<PresetFormData>(emptyPresetForm)
  const [presetSaving, setPresetSaving] = useState(false)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await getSettings()
        setSettings(data)
        setFormData(data.default_from_address)
      } catch (err) {
        console.error('Failed to load settings:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setSaved(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      await updateSettings({ default_from_address: formData })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Failed to save settings:', err)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleEnvironmentSwitch = async (env: 'test' | 'production') => {
    if (!settings?.api_environment) return
    if (env === settings.api_environment.current_environment) return

    const confirmMessage = env === 'production'
      ? 'Switch to PRODUCTION mode? This will use real money for labels!'
      : 'Switch to TEST mode? Labels created will not be real.'

    if (!confirm(confirmMessage)) return

    setSwitchingEnv(true)
    try {
      await switchApiEnvironment(env)
      // Refresh settings to get updated environment
      const data = await getSettings()
      setSettings(data)
    } catch (err: any) {
      console.error('Failed to switch environment:', err)
      alert(err.response?.data?.detail || 'Failed to switch environment')
    } finally {
      setSwitchingEnv(false)
    }
  }

  // Parcel preset handlers
  const openAddPresetModal = () => {
    setPresetForm(emptyPresetForm)
    setEditingPresetKey(null)
    setShowPresetModal(true)
  }

  const openEditPresetModal = (key: string) => {
    const preset = settings?.parcel_presets[key]
    if (!preset) return

    setPresetForm({
      key,
      name: preset.name,
      predefined_package: preset.predefined_package || '',
      length: preset.length?.toString() || '',
      width: preset.width?.toString() || '',
      height: preset.height?.toString() || '',
      weight: preset.weight.toString(),
    })
    setEditingPresetKey(key)
    setShowPresetModal(true)
  }

  const closePresetModal = () => {
    setShowPresetModal(false)
    setEditingPresetKey(null)
    setPresetForm(emptyPresetForm)
  }

  const handlePresetFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setPresetForm(prev => ({ ...prev, [name]: value }))
  }

  const handlePresetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPresetSaving(true)

    try {
      const preset: ParcelPreset = {
        name: presetForm.name,
        predefined_package: presetForm.predefined_package || null,
        length: presetForm.length ? parseFloat(presetForm.length) : null,
        width: presetForm.width ? parseFloat(presetForm.width) : null,
        height: presetForm.height ? parseFloat(presetForm.height) : null,
        weight: parseFloat(presetForm.weight),
      }

      if (editingPresetKey) {
        await updateParcelPreset(editingPresetKey, preset)
      } else {
        await addParcelPreset(presetForm.key, preset)
      }

      // Refresh settings
      const data = await getSettings()
      setSettings(data)
      closePresetModal()
    } catch (err: any) {
      console.error('Failed to save preset:', err)
      alert(err.response?.data?.detail || 'Failed to save preset')
    } finally {
      setPresetSaving(false)
    }
  }

  const handleDeletePreset = async (key: string) => {
    if (!confirm(`Delete preset "${key}"?`)) return

    try {
      await deleteParcelPreset(key)
      const data = await getSettings()
      setSettings(data)
    } catch (err: any) {
      console.error('Failed to delete preset:', err)
      alert(err.response?.data?.detail || 'Failed to delete preset')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  const apiEnv = settings?.api_environment

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-dark-400 mt-1">Configure your shipping defaults</p>
      </div>

      {/* API Environment Toggle */}
      <div className="bg-dark-900 rounded-xl border border-dark-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            API Environment
          </h2>
          {apiEnv?.is_production && (
            <span className="flex items-center gap-1 text-red-400 text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              LIVE MODE
            </span>
          )}
        </div>

        {/* Environment Toggle */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <button
            onClick={() => handleEnvironmentSwitch('test')}
            disabled={switchingEnv || !apiEnv?.test_configured}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              apiEnv?.current_environment === 'test'
                ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400'
                : 'bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600'
            } ${!apiEnv?.test_configured ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <p className="font-semibold text-lg">Test Mode</p>
            <p className="text-sm opacity-75">No real charges</p>
            {apiEnv?.test_key_prefix && (
              <p className="text-xs mt-2 font-mono opacity-50">{apiEnv.test_key_prefix}</p>
            )}
            {!apiEnv?.test_configured && (
              <p className="text-xs mt-2 text-red-400">Not configured</p>
            )}
          </button>

          <button
            onClick={() => handleEnvironmentSwitch('production')}
            disabled={switchingEnv || !apiEnv?.production_configured}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              apiEnv?.current_environment === 'production'
                ? 'bg-red-500/10 border-red-500 text-red-400'
                : 'bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600'
            } ${!apiEnv?.production_configured ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <p className="font-semibold text-lg">Production Mode</p>
            <p className="text-sm opacity-75">Real charges apply</p>
            {apiEnv?.production_key_prefix && (
              <p className="text-xs mt-2 font-mono opacity-50">{apiEnv.production_key_prefix}</p>
            )}
            {!apiEnv?.production_configured && (
              <p className="text-xs mt-2 text-red-400">Not configured</p>
            )}
          </button>
        </div>

        {switchingEnv && (
          <div className="flex items-center justify-center gap-2 text-dark-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
            Switching environment...
          </div>
        )}

        <p className="text-dark-500 text-sm">
          Test mode creates fake labels for testing. Production mode creates real, chargeable labels.
        </p>
      </div>

      {/* Default From Address */}
      <form onSubmit={handleSubmit} className="bg-dark-900 rounded-xl border border-dark-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-500" />
            Default From Address
          </h2>
          {saved && (
            <span className="flex items-center gap-1 text-green-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              Saved!
            </span>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-dark-400 text-sm mb-1">Business/Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
              placeholder="KeystonedTCG"
            />
          </div>

          <div>
            <label className="block text-dark-400 text-sm mb-1">Street Address *</label>
            <input
              type="text"
              name="street1"
              value={formData.street1}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
              placeholder="PO BOX 112"
            />
          </div>

          <div>
            <label className="block text-dark-400 text-sm mb-1">Street Address 2 (optional)</label>
            <input
              type="text"
              name="street2"
              value={formData.street2 || ''}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
              placeholder=""
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-dark-400 text-sm mb-1">City *</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                placeholder="ALBRIGHTSVILLE"
              />
            </div>
            <div>
              <label className="block text-dark-400 text-sm mb-1">State *</label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                required
                maxLength={2}
                className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white uppercase"
                placeholder="PA"
              />
            </div>
            <div>
              <label className="block text-dark-400 text-sm mb-1">ZIP *</label>
              <input
                type="text"
                name="zip"
                value={formData.zip}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                placeholder="18210"
              />
            </div>
          </div>

          <div>
            <label className="block text-dark-400 text-sm mb-1">Phone</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone || ''}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
              placeholder="000-000-0000"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </form>

      {/* Parcel Presets */}
      <div className="bg-dark-900 rounded-xl border border-dark-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-green-500" />
            Parcel Presets
          </h2>
          <button
            onClick={openAddPresetModal}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Preset
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {settings?.parcel_presets && Object.entries(settings.parcel_presets).map(([key, preset]) => (
            <div key={key} className="bg-dark-800 rounded-lg p-4 relative group">
              <div className="flex items-start justify-between">
                <h3 className="text-blue-400 font-medium mb-2">{preset.name}</h3>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditPresetModal(key)}
                    className="p-1 text-dark-400 hover:text-blue-400 transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {!['card', 'standard'].includes(key) && (
                    <button
                      onClick={() => handleDeletePreset(key)}
                      className="p-1 text-dark-400 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <ul className="text-dark-300 text-sm space-y-1">
                {preset.predefined_package && (
                  <li>Predefined: {preset.predefined_package}</li>
                )}
                {preset.length && preset.width && preset.height && (
                  <li>Dimensions: {preset.length}" x {preset.width}" x {preset.height}"</li>
                )}
                <li>Weight: {preset.weight} oz</li>
              </ul>
              <p className="text-dark-500 text-xs mt-2 font-mono">{key}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Preset Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-900 rounded-xl border border-dark-800 p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                {editingPresetKey ? 'Edit Preset' : 'Add New Preset'}
              </h3>
              <button
                onClick={closePresetModal}
                className="p-1 text-dark-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePresetSubmit} className="space-y-4">
              {!editingPresetKey && (
                <div>
                  <label className="block text-dark-400 text-sm mb-1">Key (unique identifier) *</label>
                  <input
                    type="text"
                    name="key"
                    value={presetForm.key}
                    onChange={handlePresetFormChange}
                    required
                    pattern="[a-z0-9_]+"
                    className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                    placeholder="bubble_mailer"
                  />
                  <p className="text-dark-500 text-xs mt-1">Lowercase letters, numbers, underscores only</p>
                </div>
              )}

              <div>
                <label className="block text-dark-400 text-sm mb-1">Display Name *</label>
                <input
                  type="text"
                  name="name"
                  value={presetForm.name}
                  onChange={handlePresetFormChange}
                  required
                  className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                  placeholder="Bubble Mailer"
                />
              </div>

              <div>
                <label className="block text-dark-400 text-sm mb-1">Predefined Package (optional)</label>
                <input
                  type="text"
                  name="predefined_package"
                  value={presetForm.predefined_package}
                  onChange={handlePresetFormChange}
                  className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                  placeholder="card, letter, flat, etc."
                />
                <p className="text-dark-500 text-xs mt-1">Leave empty to use custom dimensions</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-dark-400 text-sm mb-1">Length (in)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="length"
                    value={presetForm.length}
                    onChange={handlePresetFormChange}
                    className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                    placeholder="6"
                  />
                </div>
                <div>
                  <label className="block text-dark-400 text-sm mb-1">Width (in)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="width"
                    value={presetForm.width}
                    onChange={handlePresetFormChange}
                    className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                    placeholder="4.5"
                  />
                </div>
                <div>
                  <label className="block text-dark-400 text-sm mb-1">Height (in)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="height"
                    value={presetForm.height}
                    onChange={handlePresetFormChange}
                    className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                    placeholder="0.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-dark-400 text-sm mb-1">Weight (oz) *</label>
                <input
                  type="number"
                  step="0.1"
                  name="weight"
                  value={presetForm.weight}
                  onChange={handlePresetFormChange}
                  required
                  className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                  placeholder="5"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closePresetModal}
                  className="flex-1 py-2 bg-dark-700 hover:bg-dark-600 text-white font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={presetSaving}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {presetSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {editingPresetKey ? 'Update' : 'Add'} Preset
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
