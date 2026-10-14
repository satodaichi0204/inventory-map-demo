export type Product = {
  id: string;
  jan_code: string;
  name: string;
  category: string | null;
};

/** stores_nearby 関数の戻り値 */
export type NearbyStore = {
  id: string;
  name: string;
  address: string;
  opening_hours: string | null;
  lat: number;
  lng: number;
  distance_m: number;
  quantity: number | null;
  updated_at: string | null;
};

/** store_list ビューの行 */
export type StoreInfo = {
  id: string;
  name: string;
  address: string;
  opening_hours: string | null;
  lat: number;
  lng: number;
};

export type InventoryRow = {
  store_id: string;
  product_id: string;
  quantity: number;
  updated_at: string;
  updated_by: string | null;
};

export type LatLng = { lat: number; lng: number };
