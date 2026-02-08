import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: redirect to login on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      delete api.defaults.headers.common['Authorization']
      if (!error.config?.url?.includes('/auth/')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Types
export interface Address {
  name: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country?: string
  phone?: string
}

export interface Shipment {
  id: number
  easypost_id: string
  tracking_code: string
  label_url: string
  from_name: string
  from_street1: string
  from_street2: string
  from_city: string
  from_state: string
  from_zip: string
  from_country: string
  from_phone: string
  to_name: string
  to_street1: string
  to_street2: string
  to_city: string
  to_state: string
  to_zip: string
  to_country: string
  to_phone: string
  carrier: string
  service: string
  cost: number
  method: string
  parcel_weight: number
  parcel_length: number | null
  parcel_width: number | null
  parcel_height: number | null
  parcel_predefined: string | null
  status: string
  manifested: string | null  // ScanForm ID if already manifested
  easypost_created_at: string | null  // When EasyPost created the shipment
  created_at: string
}

export interface DashboardStats {
  total_shipments: number
  total_cost: number
  shipments_today: number
  cost_today: number
  shipments_this_week: number
  cost_this_week: number
  card_shipments: number
  tracked_shipments: number
}

export interface ApiEnvironment {
  current_environment: 'test' | 'production'
  is_production: boolean
  production_configured: boolean
  test_configured: boolean
  production_key_prefix: string | null
  test_key_prefix: string | null
}

export interface Settings {
  default_from_address: Address
  parcel_presets: ParcelPresets
  api_environment: ApiEnvironment
}

export interface Rate {
  carrier: string
  service: string
  rate: number
  delivery_days?: number
}

export interface ParcelPreset {
  name: string
  predefined_package?: string | null
  length?: number | null
  width?: number | null
  height?: number | null
  weight: number
}

export interface ParcelPresets {
  [key: string]: ParcelPreset
}

export interface SavedAddress extends Address {
  label: string  // Display label like "Main Warehouse", "Home Office"
}

export interface SavedAddresses {
  [key: string]: SavedAddress
}

export interface CustomParcel {
  length: number
  width: number
  height: number
  weight: number
}

export interface CreateLabelRequest {
  to_address: Address
  from_address?: Address
  parcel_type?: string
  custom_parcel?: CustomParcel
  insurance_amount?: number  // Insurance value in dollars (e.g., 100.00)
}

// Filter options for shipments
export interface ShipmentFilters {
  search?: string
  method?: string
  carrier?: string
  manifested?: 'yes' | 'no'
}

// API functions
export const getShipments = async (page = 1, pageSize = 20, filters: ShipmentFilters = {}) => {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (filters.search) params.append('search', filters.search)
  if (filters.method) params.append('method', filters.method)
  if (filters.carrier) params.append('carrier', filters.carrier)
  if (filters.manifested) params.append('manifested', filters.manifested)
  const response = await api.get(`/shipments?${params}`)
  return response.data
}

export const getShipmentStats = async (): Promise<DashboardStats> => {
  const response = await api.get('/shipments/stats')
  return response.data
}

export const syncShipments = async () => {
  const response = await api.post('/shipments/sync')
  return response.data
}

export const getSettings = async (): Promise<Settings> => {
  const response = await api.get('/settings')
  return response.data
}

export const updateSettings = async (settings: Partial<Settings>) => {
  const response = await api.put('/settings', settings)
  return response.data
}

export const getApiEnvironment = async (): Promise<ApiEnvironment> => {
  const response = await api.get('/settings/environment')
  return response.data
}

export const switchApiEnvironment = async (environment: 'test' | 'production') => {
  const response = await api.put('/settings/environment', { environment })
  return response.data
}

export const getRates = async (request: CreateLabelRequest): Promise<{ rates: Rate[]; lowest_rate: Rate | null }> => {
  const response = await api.get('/labels/rates', { params: request })
  return response.data
}

export const createLabel = async (request: CreateLabelRequest) => {
  const response = await api.post('/labels/create', request)
  return response.data
}

export const uploadBulkLabels = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post('/labels/bulk', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

// Parcel Presets
export const getParcelPresets = async (): Promise<ParcelPresets> => {
  const response = await api.get('/settings/parcel-presets')
  return response.data
}

export const addParcelPreset = async (key: string, preset: ParcelPreset): Promise<{ message: string; presets: ParcelPresets }> => {
  const response = await api.post('/settings/parcel-presets', { key, preset })
  return response.data
}

export const updateParcelPreset = async (key: string, preset: ParcelPreset): Promise<{ message: string; presets: ParcelPresets }> => {
  const response = await api.put(`/settings/parcel-presets/${key}`, preset)
  return response.data
}

export const deleteParcelPreset = async (key: string): Promise<{ message: string; presets: ParcelPresets }> => {
  const response = await api.delete(`/settings/parcel-presets/${key}`)
  return response.data
}

// Saved Addresses
export const getSavedAddresses = async (): Promise<SavedAddresses> => {
  const response = await api.get('/settings/saved-addresses')
  return response.data
}

export const addSavedAddress = async (key: string, address: SavedAddress): Promise<{ message: string; addresses: SavedAddresses }> => {
  const response = await api.post('/settings/saved-addresses', { key, address })
  return response.data
}

export const updateSavedAddress = async (key: string, address: SavedAddress): Promise<{ message: string; addresses: SavedAddresses }> => {
  const response = await api.put(`/settings/saved-addresses/${key}`, address)
  return response.data
}

export const deleteSavedAddress = async (key: string): Promise<{ message: string; addresses: SavedAddresses }> => {
  const response = await api.delete(`/settings/saved-addresses/${key}`)
  return response.data
}

export const setDefaultAddress = async (key: string): Promise<{ message: string; default_from_address: Address }> => {
  const response = await api.put(`/settings/saved-addresses/${key}/set-default`)
  return response.data
}

// ScanForm
export interface ScanFormResponse {
  id: string
  status: string
  form_url: string
  tracking_codes: string[]
  created_at: string
}

export interface ScanFormItem {
  id: number
  easypost_id: string
  status: string
  form_url: string
  tracking_codes: string[]
  shipment_count: number
  created_at: string
}

export interface ScanFormListResponse {
  scanforms: ScanFormItem[]
  total: number
}

export const createScanForm = async (shipmentIds: number[]): Promise<ScanFormResponse> => {
  const response = await api.post('/labels/scanform', { shipment_ids: shipmentIds })
  return response.data
}

export const getScanForms = async (): Promise<ScanFormListResponse> => {
  const response = await api.get('/scanforms')
  return response.data
}

export const syncScanForms = async () => {
  const response = await api.post('/scanforms/sync')
  return response.data
}

export default api
