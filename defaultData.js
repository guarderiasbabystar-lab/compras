// Datos semilla usados cuando Firestore está vacío.

export const INVENTARIO_DEFAULT = {
  "Verduras y Hortalizas": { proveedor: "Proveedor Frutas y Verduras", productos: ["Ajo Criollo (kg)", "Brócoli (pz)", "Cebolla (Kg)", "Jitomate (Kg)", "Limón (Kg)", "Papa (Kg)", "Zanahoria (Kg)"] },
  "Frutas": { proveedor: "Proveedor Frutas y Verduras", productos: ["Aguacate Hass (Kg)", "Manzana (kg)", "Naranja (kg)", "Plátano (Kg)"] },
  "Carnes y Proteínas": { proveedor: "Proveedor de Carnes", productos: ["Molida de pollo (kg)", "Molida de res (Kg)", "Pollo (bolsa muslos 4pz)"] },
  "Lácteos y Huevo": { proveedor: "Proveedor de Lácteos", productos: ["Huevo (Tapa)", "Leche Nutrileche (caja)", "Queso panela (Kg)"] },
  "Abarrotes y Otros": { proveedor: "Abarrotera / Sam's", productos: ["Aceite Nutrioli 800ml o 940ml(pz)", "Azúcar (Kg)", "Nescafé Lata 1K"] }
};

export const SUCURSALES_DEFAULT = [
  { id: 'suc-1', nombre: 'Sucursal del Valle', iniciales: 'DV', supervisora: 'Ana López', correo: 'ana.lopez@empresa.com', pin: '1234', idComprador: 'comp-1' },
  { id: 'suc-2', nombre: 'Sucursal Narvarte', iniciales: 'NA', supervisora: 'María Pérez', correo: 'maria.perez@empresa.com', pin: '1234', idComprador: 'comp-1' }
];

export const COMPRADORES_DEFAULT = [
  { id: 'comp-1', nombre: 'Carlos Ruiz', correo: 'carlos.compras@empresa.com', pin: '8888' },
  { id: 'comp-2', nombre: 'Laura Martínez', correo: 'laura.compras@empresa.com', pin: '8888' }
];
