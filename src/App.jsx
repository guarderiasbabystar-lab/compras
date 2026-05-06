import React, { useState, useEffect } from 'react';
import { ShoppingCart, Send, ClipboardList, CheckCircle, Search, Mail, Building, Plus, Minus, Trash2, Lock, User, LogOut, MessageSquare, FileDown, Settings, Users, Package, Save, X, Edit2, Edit, Filter } from 'lucide-react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db, appId } from './firebase';
import { INVENTARIO_DEFAULT, SUCURSALES_DEFAULT, COMPRADORES_DEFAULT } from './defaultData';

export default function App() {
  // Estado Firebase y Autenticación Global
  const [firebaseUser, setFirebaseUser] = useState(null);
  
  // Base de Datos en Tiempo Real (Sincronizada con Firebase)
  const [inventarioDB, setInventarioDB] = useState({});
  const [sucursalesDB, setSucursalesDB] = useState([]);
  const [compradoresDB, setCompradoresDB] = useState([]);
  const [historialPedidos, setHistorialPedidos] = useState([]);
  const [adminConfig, setAdminConfig] = useState({ adminEmail: 'admin@empresa.com', adminPin: '7777', compradorPin: '8888' });
  const [dbCargada, setDbCargada] = useState(false);

  // Estado de Autenticación Local (Rol)
  const [usuarioActual, setUsuarioActual] = useState(null); 
  const [loginType, setLoginType] = useState('sucursal'); // 'sucursal', 'comprador', 'admin'
  const [loginId, setLoginId] = useState(''); // Estado unificado para seleccionar Sucursal o Comprador
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');

  // Estados de la App Principal
  const [activeView, setActiveView] = useState('nuevo-pedido'); 
  const [pedidoActual, setPedidoActual] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [notas, setNotas] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  // Estados para Filtros en Reportes
  const [filterId, setFilterId] = useState('');
  const [filterSucursal, setFilterSucursal] = useState('');
  const [filterFecha, setFilterFecha] = useState('');

  // Estados del Panel Admin
  const [adminTab, setAdminTab] = useState('sucursales');
  const [editItem, setEditItem] = useState(null);
  const [ordenEditando, setOrdenEditando] = useState(null); // Nuevo estado para modal de comprador

  // Nuevos estados para reemplazar window.prompt y window.confirm
  const [modalConfirm, setModalConfirm] = useState({ isOpen: false, mensaje: '', onConfirm: null });
  const [modalPrompt, setModalPrompt] = useState({ isOpen: false, titulo: '', placeholder: '', valor: '', onConfirm: null });

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // --- 1. CONFIGURACIÓN FIREBASE (USE EFFECT) ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Error autenticando Firebase. Asegúrate de habilitar 'Anónimo' en Auth:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, setFirebaseUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;

    // Escuchar Configuración (Admin)
    const refConfig = doc(db, 'artifacts', appId, 'public', 'data', 'configuracion', 'admin');
    const unsubConfig = onSnapshot(refConfig, (docSnap) => {
      if (!docSnap.exists()) {
        setDoc(refConfig, { adminEmail: 'tu_correo@empresa.com', adminPin: '7777', compradorPin: '8888' });
      } else {
        setAdminConfig(docSnap.data());
      }
    });

    // Escuchar Inventario (Con Normalización para soportar la actualización a proveedores)
    const refInv = doc(db, 'artifacts', appId, 'public', 'data', 'inventario', 'catalogo');
    const unsubInv = onSnapshot(refInv, (docSnap) => {
      if (!docSnap.exists()) {
        setDoc(refInv, { categorias: INVENTARIO_DEFAULT });
      } else {
        const rawData = docSnap.data().categorias || {};
        const normalized = {};
        // Convertimos estructuras antiguas (arreglos puros) a la nueva con proveedores
        Object.keys(rawData).forEach(key => {
          if (Array.isArray(rawData[key])) {
            normalized[key] = { proveedor: 'Por definir', productos: rawData[key] };
          } else {
            normalized[key] = rawData[key];
          }
        });
        setInventarioDB(normalized);
      }
    });

    // Escuchar Sucursales
    const refSuc = collection(db, 'artifacts', appId, 'public', 'data', 'sucursales');
    const unsubSuc = onSnapshot(refSuc, (snap) => {
      if (snap.empty && !dbCargada) {
        SUCURSALES_DEFAULT.forEach(suc => {
          setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sucursales', suc.id), suc);
        });
      } else {
        const sucs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSucursalesDB(sucs);
      }
    });

    // Escuchar Compradores
    const refComp = collection(db, 'artifacts', appId, 'public', 'data', 'compradores');
    const unsubComp = onSnapshot(refComp, (snap) => {
      if (snap.empty && !dbCargada) {
        COMPRADORES_DEFAULT.forEach(comp => {
          setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'compradores', comp.id), comp);
        });
      } else {
        const comps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCompradoresDB(comps);
      }
    });

    // Escuchar Pedidos
    const refPedidos = collection(db, 'artifacts', appId, 'public', 'data', 'pedidos');
    const unsubPedidos = onSnapshot(refPedidos, (snap) => {
      const peds = snap.docs.map(d => ({ dbId: d.id, ...d.data() }));
      // Ordenar por fecha descendente
      peds.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      setHistorialPedidos(peds);
      setDbCargada(true);
    });

    return () => { unsubConfig(); unsubInv(); unsubSuc(); unsubComp(); unsubPedidos(); };
  }, [firebaseUser]);

  // --- FUNCIONES DE LOGIN ---
  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError('');

    if (loginType === 'admin') {
      if (loginPin === adminConfig.adminPin) {
        setUsuarioActual({ rol: 'admin', nombre: 'Administrador Principal' });
        setActiveView('admin-panel');
        setLoginPin('');
      } else {
        setLoginError('PIN de Administrador incorrecto.');
      }
      return;
    }

    if (loginType === 'comprador') {
      const compradorData = compradoresDB.find(c => c.id === loginId);
      if (!compradorData) {
        setLoginError('Por favor selecciona tu perfil de comprador.');
        return;
      }

      if (compradorData.pin === loginPin) {
        setUsuarioActual({ rol: 'comprador', ...compradorData });
        setActiveView('reportes');
        setLoginPin('');
      } else {
        setLoginError('PIN de Comprador incorrecto.');
      }
      return;
    }

    if (loginType === 'sucursal') {
      const sucursalData = sucursalesDB.find(s => s.id === loginId);
      if (!sucursalData) {
        setLoginError('Por favor selecciona una sucursal.');
        return;
      }

      if (sucursalData.pin === loginPin) {
        setUsuarioActual({ rol: 'sucursal', ...sucursalData });
        setLoginPin(''); 
        setActiveView('nuevo-pedido');
      } else {
        setLoginError('PIN incorrecto. Intenta de nuevo.');
      }
    }
  };

  const handleLogout = () => {
    setUsuarioActual(null);
    setPedidoActual({});
    setNotas('');
    setFilterId('');
    setFilterSucursal('');
    setFilterFecha('');
    setLoginId('');
    setLoginType('sucursal');
    setActiveView('nuevo-pedido');
  };

  // --- FUNCIONES DE CARRO DE COMPRAS ---
  const actualizarCantidad = (producto, cantidadStr) => {
    const cantidad = parseFloat(cantidadStr);
    const nuevoPedido = { ...pedidoActual };
    if (isNaN(cantidad) || cantidad <= 0) {
      delete nuevoPedido[producto];
    } else {
      nuevoPedido[producto] = cantidad;
    }
    setPedidoActual(nuevoPedido);
  };

  const incrementar = (prod) => actualizarCantidad(prod, (pedidoActual[prod] || 0) + 1);
  const decrementar = (prod) => {
    if (pedidoActual[prod] > 0) actualizarCantidad(prod, pedidoActual[prod] - 1);
  };

  const totalArticulos = Object.keys(pedidoActual).length;

  // --- ENVÍO DE DATOS ---
  const enviarPedido = async () => {
    if (totalArticulos === 0 && notas.trim() === '') {
      showToast("El pedido está vacío. Agrega productos o una nota.");
      return;
    }

    const maxConsecutivo = historialPedidos.reduce((max, p) => Math.max(max, p.consecutivo || 0), 0);
    const nuevoConsecutivo = maxConsecutivo + 1;
    const iniciales = usuarioActual.iniciales || usuarioActual.nombre.substring(0, 2).toUpperCase();
    const newId = `PED-${iniciales}-${nuevoConsecutivo.toString().padStart(4, '0')}`;
    const compradorAsignado = compradoresDB.find(c => c.id === usuarioActual.idComprador);

    // Novedad: Agrupar los detalles por proveedor para el guardado
    const detallesPorProveedor = {};
    Object.entries(pedidoActual).forEach(([prod, cant]) => {
      let provEncontrado = "Otros (Sin asignar)";
      for (const [cName, cData] of Object.entries(inventarioDB)) {
        if (cData.productos && cData.productos.includes(prod)) {
          provEncontrado = cData.proveedor || "Otros (Sin asignar)";
          break;
        }
      }
      if (!detallesPorProveedor[provEncontrado]) detallesPorProveedor[provEncontrado] = {};
      detallesPorProveedor[provEncontrado][prod] = cant;
    });

    const nuevoRegistro = {
      id: newId,
      consecutivo: nuevoConsecutivo,
      sucursal: usuarioActual.nombre,
      correoSupervisora: usuarioActual.correo || '',
      nombreComprador: compradorAsignado ? compradorAsignado.nombre : 'Equipo de Compras',
      correoComprador: compradorAsignado ? compradorAsignado.correo : '',
      fecha: new Date().toLocaleString(),
      timestamp: new Date().toISOString(),
      estado: "Pendiente",
      detalles: pedidoActual,
      detallesPorProveedor: detallesPorProveedor, // Guardamos la agrupación
      notas: notas.trim()
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pedidos', newId), nuevoRegistro);
      setPedidoActual({});
      setSearchTerm('');
      setNotas('');
      showToast(`¡Pedido guardado! Folio: ${newId}`);
      setActiveView('reportes');
    } catch (error) {
      showToast("Error guardando el pedido en la base de datos.");
    }
  };

  const procesarCorreo = async (pedidoId, correoSup) => {
    const pedido = historialPedidos.find(p => p.id === pedidoId);
    
    let listaArticulos = "";
    // Verificamos si tiene la nueva agrupación por proveedores o es un pedido antiguo
    if (pedido.detallesPorProveedor) {
      Object.entries(pedido.detallesPorProveedor).forEach(([prov, prods]) => {
        listaArticulos += `\n📦 PROVEEDOR: ${prov.toUpperCase()}\n`;
        Object.entries(prods).forEach(([prod, cant]) => {
          listaArticulos += `• ${cant} x ${prod}\n`;
        });
      });
    } else {
      Object.entries(pedido.detalles).forEach(([prod, cant]) => {
        listaArticulos += `• ${cant} x ${prod}\n`;
      });
    }

    const notasTexto = pedido.notas ? `\nNotas adicionales de la sucursal:\n${pedido.notas}\n` : '';

    const nombreComprador = pedido.nombreComprador && pedido.nombreComprador !== 'Equipo de Compras' ? ` y ${pedido.nombreComprador}` : '';
    const saludo = `Hola ${pedido.supervisora}${nombreComprador},`;
    
    const destinatariosArray = [correoSup];
    if (pedido.correoComprador) destinatariosArray.push(pedido.correoComprador);
    const destinatarios = destinatariosArray.join(',');

    const asunto = encodeURIComponent(`Reporte de Pedido [${pedido.id}] - ${pedido.sucursal}`);
    const cuerpo = encodeURIComponent(
      `${saludo}\n\nSe ha registrado un nuevo pedido de la ${pedido.sucursal} con fecha ${pedido.fecha}.\n\nDetalle de los artículos solicitados:\n${listaArticulos}${notasTexto}\nSaludos cordiales.`
    );
    
    const mailtoUrl = `mailto:${destinatarios}?cc=${adminConfig.adminEmail}&subject=${asunto}&body=${cuerpo}`;
    const link = document.createElement('a');
    link.href = mailtoUrl;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pedidos', pedidoId), {
        ...pedido,
        estado: "Correo Preparado"
      }, { merge: true });
      showToast("Abriendo tu aplicación de correo...");
    } catch (e) {
      console.error(e);
    }
  };

  const generarPDF = (idPedido) => {
    const pedido = historialPedidos.find(p => p.id === idPedido);
    if (!pedido) return;

    const ventana = window.open('', '_blank');
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pedido_${pedido.id}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #333; }
            .header { border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; }
            h1 { color: #2563eb; margin: 0 0 10px 0; font-size: 24px; }
            .meta { font-size: 14px; color: #555; line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
            th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
            th { background-color: #f8fafc; font-weight: bold; }
            .prov-header { background-color: #f1f5f9; color: #334155; font-weight: bold; padding: 10px 12px; }
            .notas { margin-top: 30px; padding: 15px; background-color: #fffbeb; border-left: 4px solid #f59e0b; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Reporte de Pedido: ${pedido.id}</h1>
            <div class="meta">
              <strong>Sucursal:</strong> ${pedido.sucursal}<br/>
              <strong>Fecha:</strong> ${pedido.fecha}
            </div>
          </div>
          <table>
            <thead><tr><th>Producto</th><th style="width:100px;text-align:center;">Cantidad</th></tr></thead>
            <tbody>
              ${pedido.detallesPorProveedor ? 
                Object.entries(pedido.detallesPorProveedor).map(([prov, prods]) => `
                  <tr><td colspan="2" class="prov-header">📦 Proveedor: ${prov}</td></tr>
                  ${Object.entries(prods).map(([prod, cant]) => `
                    <tr><td style="padding-left: 20px;">${prod}</td><td style="text-align: center;"><strong>${cant}</strong></td></tr>
                  `).join('')}
                `).join('')
              :
                Object.entries(pedido.detalles).map(([prod, cant]) => `
                  <tr><td>${prod}</td><td style="text-align: center;"><strong>${cant}</strong></td></tr>
                `).join('')
              }
            </tbody>
          </table>
          ${pedido.notas ? `<div class="notas"><strong>Notas Extras:</strong><br/>${pedido.notas.replace(/\n/g, '<br/>')}</div>` : ''}
        </body>
      </html>
    `;
    ventana.document.write(html);
    ventana.document.close();
    setTimeout(() => ventana.print(), 250);
  };

  // --- FUNCIONES ADMINISTRATIVAS Y COMPRADOR ---
  const guardarEstadoPedido = async (e) => {
    e.preventDefault();
    try {
      const pedidoRef = doc(db, 'artifacts', appId, 'public', 'data', 'pedidos', ordenEditando.dbId);
      await setDoc(pedidoRef, {
        estado: ordenEditando.estado,
        notaComprador: ordenEditando.notaComprador || ''
      }, { merge: true });
      setOrdenEditando(null);
      showToast("Estado del pedido actualizado exitosamente");
    } catch (error) {
      showToast("Error actualizando pedido");
    }
  };

  const guardarInventarioDB = async (nuevoInv) => {
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventario', 'catalogo'), { categorias: nuevoInv });
    showToast("Inventario actualizado");
  };

  const agregarCategoria = () => {
    setModalPrompt({
      isOpen: true,
      titulo: "Añadir Nueva Categoría",
      placeholder: "Ej. Limpieza, Abarrotes...",
      valor: '',
      onConfirm: (nombre) => {
        if (nombre && !inventarioDB[nombre]) {
          guardarInventarioDB({ ...inventarioDB, [nombre]: { proveedor: 'Por definir', productos: [] } });
        }
      }
    });
  };

  const editarNombreCategoria = (catActual) => {
    setModalPrompt({
      isOpen: true,
      titulo: `Renombrar categoría: ${catActual}`,
      placeholder: "Nuevo nombre de la categoría...",
      valor: catActual,
      onConfirm: (nuevoNombre) => {
        const nombreLimpio = nuevoNombre.trim();
        if (nombreLimpio && nombreLimpio !== catActual) {
          if (inventarioDB[nombreLimpio]) {
            showToast("Ya existe una categoría con ese nombre.");
            return;
          }
          const nuevo = { ...inventarioDB };
          nuevo[nombreLimpio] = nuevo[catActual]; // Copiamos el proveedor y productos a la nueva llave
          delete nuevo[catActual]; // Borramos la llave vieja
          guardarInventarioDB(nuevo);
        }
      }
    });
  };

  const editarProveedor = (cat, provActual) => {
    setModalPrompt({
      isOpen: true,
      titulo: `Asignar proveedor para: ${cat}`,
      placeholder: "Nombre del proveedor...",
      valor: provActual === 'Por definir' ? '' : provActual,
      onConfirm: (nuevoProv) => {
        if (nuevoProv && nuevoProv.trim() !== "") {
          const nuevo = { ...inventarioDB };
          nuevo[cat].proveedor = nuevoProv.trim();
          guardarInventarioDB(nuevo);
        }
      }
    });
  };

  const eliminarCategoria = (cat) => {
    setModalConfirm({
      isOpen: true,
      mensaje: `¿Seguro que deseas eliminar la categoría "${cat}" y todos sus productos?`,
      onConfirm: () => {
        const nuevo = { ...inventarioDB };
        delete nuevo[cat];
        guardarInventarioDB(nuevo);
      }
    });
  };

  const agregarArticulo = (categoria) => {
    setModalPrompt({
      isOpen: true,
      titulo: `Añadir artículo a ${categoria}`,
      placeholder: "Nombre del producto",
      valor: '',
      onConfirm: (articulo) => {
        if (articulo && articulo.trim() !== "") {
          const nuevo = { ...inventarioDB };
          nuevo[categoria].productos = [...nuevo[categoria].productos, articulo.trim()];
          guardarInventarioDB(nuevo);
        }
      }
    });
  };

  const eliminarArticulo = (categoria, index) => {
    setModalConfirm({
      isOpen: true,
      mensaje: "¿Eliminar este producto del catálogo?",
      onConfirm: () => {
        const nuevo = { ...inventarioDB };
        nuevo[categoria].productos = nuevo[categoria].productos.filter((_, i) => i !== index);
        guardarInventarioDB(nuevo);
      }
    });
  };

  const guardarSucursalDB = async (e) => {
    e.preventDefault();
    const id = editItem.id || `suc-${Date.now()}`;
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sucursales', id), { ...editItem, id });
    setEditItem(null);
    showToast("Sucursal guardada");
  };

  const eliminarSucursalDB = async (id) => {
    setModalConfirm({
      isOpen: true,
      mensaje: "¿Seguro que deseas eliminar esta sucursal del sistema?",
      onConfirm: async () => {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sucursales', id));
        showToast("Sucursal eliminada");
      }
    });
  };

  const guardarCompradorDB = async (e) => {
    e.preventDefault();
    const id = editItem.id || `comp-${Date.now()}`;
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'compradores', id), { ...editItem, id });
    setEditItem(null);
    showToast("Comprador guardado");
  };

  const eliminarCompradorDB = async (id) => {
    setModalConfirm({
      isOpen: true,
      mensaje: "¿Seguro que deseas eliminar a este comprador del sistema?",
      onConfirm: async () => {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'compradores', id));
        showToast("Comprador eliminado");
      }
    });
  };

  const guardarConfiguracion = async (e) => {
    e.preventDefault();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'configuracion', 'admin'), adminConfig);
    showToast("Configuración guardada");
  };

  // --- VISTAS ---

  if (!dbCargada) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-100 text-blue-600 font-bold">Cargando Sistema...</div>;
  }

  // VISTA LOGIN
  if (!usuarioActual) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 border border-slate-200">
          <div className="flex flex-col items-center justify-center mb-8">
            <div className="bg-blue-600 p-3 rounded-xl text-white mb-4 shadow-lg"><ClipboardList size={32} /></div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Supply<span className="text-blue-600">Pro</span></h1>
            <p className="text-slate-500 text-sm mt-1">Portal Operativo</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Toggle Tipo de Usuario */}
            <div className="flex justify-center mb-6">
              <div className="bg-slate-100 p-1 rounded-lg inline-flex w-full overflow-hidden">
                <button type="button" onClick={() => {setLoginType('sucursal'); setLoginId(''); setLoginError('');}} className={`flex-1 px-2 py-2 text-xs sm:text-sm font-semibold rounded-md transition-all ${loginType === 'sucursal' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Sucursales</button>
                <button type="button" onClick={() => {setLoginType('comprador'); setLoginId(''); setLoginError('');}} className={`flex-1 px-2 py-2 text-xs sm:text-sm font-semibold rounded-md transition-all ${loginType === 'comprador' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Comprador</button>
                <button type="button" onClick={() => {setLoginType('admin'); setLoginId(''); setLoginError('');}} className={`flex-1 px-2 py-2 text-xs sm:text-sm font-semibold rounded-md transition-all ${loginType === 'admin' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Admin</button>
              </div>
            </div>

            {loginType === 'sucursal' && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Sucursal</label>
                <div className="relative">
                  <Building className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <select 
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    value={loginId} onChange={(e) => setLoginId(e.target.value)}
                  >
                    <option value="" disabled>Selecciona una sucursal...</option>
                    {sucursalesDB.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
              </div>
            )}

            {loginType === 'comprador' && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Perfil de Comprador</label>
                <div className="relative">
                  <Users className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <select 
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    value={loginId} onChange={(e) => setLoginId(e.target.value)}
                  >
                    <option value="" disabled>Selecciona tu perfil...</option>
                    {compradoresDB.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {loginType === 'admin' ? 'PIN de Administrador' : loginType === 'comprador' ? 'PIN de Comprador' : 'PIN de Acceso'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                  type="password" placeholder="Ingresa el PIN"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  value={loginPin} onChange={(e) => setLoginPin(e.target.value)}
                />
              </div>
            </div>

            {loginError && <p className="text-red-500 text-sm text-center font-medium">{loginError}</p>}

            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-md mt-2 flex justify-center items-center gap-2">
              {loginType === 'admin' ? <Settings size={18}/> : loginType === 'comprador' ? <Users size={18}/> : <User size={18} />} Ingresar
            </button>
          </form>
        </div>
      </div>
    );
  }

  // VISTA PANEL DE ADMINISTRACIÓN
  const renderAdminPanel = () => (
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6">
      {/* Sidebar Admin */}
      <div className="w-full md:w-64 flex flex-col gap-2">
        <button onClick={() => setAdminTab('sucursales')} className={`flex items-center gap-3 p-3 rounded-lg font-semibold transition-colors ${adminTab === 'sucursales' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}>
          <Building size={18} /> Gestionar Sucursales
        </button>
        <button onClick={() => setAdminTab('compradores')} className={`flex items-center gap-3 p-3 rounded-lg font-semibold transition-colors ${adminTab === 'compradores' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}>
          <Users size={18} /> Equipo de Compras
        </button>
        <button onClick={() => setAdminTab('inventario')} className={`flex items-center gap-3 p-3 rounded-lg font-semibold transition-colors ${adminTab === 'inventario' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}>
          <Package size={18} /> Catálogo e Inventario
        </button>
        <button onClick={() => setAdminTab('configuracion')} className={`flex items-center gap-3 p-3 rounded-lg font-semibold transition-colors ${adminTab === 'configuracion' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}>
          <Settings size={18} /> Ajustes Globales
        </button>
      </div>

      {/* Main Content Admin */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-h-[60vh]">
        
        {/* TABS CONTENIDO */}
        {adminTab === 'sucursales' && (
          <div>
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Building className="text-blue-600"/> Directorio de Sucursales</h2>
              <button onClick={() => setEditItem({nombre:'', iniciales:'', supervisora:'', correo:'', pin:'', idComprador:''})} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                <Plus size={16}/> Nueva
              </button>
            </div>
            
            {editItem && adminTab === 'sucursales' && (
              <form onSubmit={guardarSucursalDB} className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                <button type="button" onClick={() => setEditItem(null)} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                <h3 className="col-span-full font-bold text-slate-700 mb-2">{editItem.id ? 'Editar Sucursal' : 'Crear Nueva Sucursal'}</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nombre</label>
                  <input required className="w-full p-2 border rounded" value={editItem.nombre} onChange={e => setEditItem({...editItem, nombre: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Iniciales (Ej. SA, DV)</label>
                  <input required className="w-full p-2 border rounded" placeholder="Máx. 4 letras" maxLength={4} value={editItem.iniciales || ''} onChange={e => setEditItem({...editItem, iniciales: e.target.value.toUpperCase()})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Supervisora</label>
                  <input required className="w-full p-2 border rounded" value={editItem.supervisora} onChange={e => setEditItem({...editItem, supervisora: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Correo Envío (Supervisora)</label>
                  <input required type="email" className="w-full p-2 border rounded" value={editItem.correo} onChange={e => setEditItem({...editItem, correo: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Comprador Asignado</label>
                  <select required className="w-full p-2 border rounded bg-white" value={editItem.idComprador || ''} onChange={e => setEditItem({...editItem, idComprador: e.target.value})}>
                    <option value="" disabled>Selecciona comprador...</option>
                    {compradoresDB.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">PIN de Acceso</label>
                  <input required className="w-full p-2 border rounded" value={editItem.pin} onChange={e => setEditItem({...editItem, pin: e.target.value})} />
                </div>
                <div className="col-span-full flex justify-end mt-2">
                  <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2"><Save size={16}/> Guardar</button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {sucursalesDB.map(s => {
                const compradorAsignado = compradoresDB.find(c => c.id === s.idComprador);
                return (
                  <div key={s.id} className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 bg-white">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg text-slate-800">{s.nombre} <span className="text-sm font-normal text-slate-500">({s.iniciales || '-'})</span></h3>
                      <div className="flex gap-2">
                        <button onClick={() => setEditItem(s)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={16}/></button>
                        <button onClick={() => eliminarSucursalDB(s.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 flex items-center gap-2 mb-1"><User size={14}/> {s.supervisora}</p>
                    <p className="text-sm text-slate-600 flex items-center gap-2 mb-1"><Mail size={14}/> {s.correo}</p>
                    <p className="text-sm text-blue-600 flex items-center gap-2 mb-1"><Users size={14}/> Comprador: {compradorAsignado ? compradorAsignado.nombre : 'Sin asignar'}</p>
                    <p className="text-xs font-mono bg-slate-100 inline-block px-2 py-1 rounded text-slate-500 mt-2">PIN: {s.pin}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {adminTab === 'compradores' && (
          <div>
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Users className="text-blue-600"/> Equipo de Compras</h2>
              <button onClick={() => setEditItem({nombre:'', correo:'', pin:''})} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                <Plus size={16}/> Nuevo Comprador
              </button>
            </div>
            
            {editItem && adminTab === 'compradores' && (
              <form onSubmit={guardarCompradorDB} className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                <button type="button" onClick={() => setEditItem(null)} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                <h3 className="col-span-full font-bold text-slate-700 mb-2">{editItem.id ? 'Editar Comprador' : 'Añadir Nuevo Comprador'}</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nombre Completo</label>
                  <input required className="w-full p-2 border rounded" value={editItem.nombre} onChange={e => setEditItem({...editItem, nombre: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Correo Electrónico (Para recibir copias)</label>
                  <input required type="email" className="w-full p-2 border rounded" value={editItem.correo} onChange={e => setEditItem({...editItem, correo: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">PIN de Acceso</label>
                  <input required className="w-full p-2 border rounded" value={editItem.pin} onChange={e => setEditItem({...editItem, pin: e.target.value})} />
                </div>
                <div className="col-span-full flex justify-end mt-2">
                  <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2"><Save size={16}/> Guardar</button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {compradoresDB.map(c => (
                <div key={c.id} className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 bg-white">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-slate-800">{c.nombre}</h3>
                    <div className="flex gap-2">
                      <button onClick={() => setEditItem(c)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={16}/></button>
                      <button onClick={() => eliminarCompradorDB(c.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 flex items-center gap-2 mb-1"><Mail size={14}/> {c.correo}</p>
                  <p className="text-xs font-mono bg-slate-100 inline-block px-2 py-1 rounded text-slate-500 mt-2">PIN: {c.pin}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {adminTab === 'inventario' && (
          <div>
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Package className="text-blue-600"/> Base de Datos de Catálogo</h2>
              <button onClick={agregarCategoria} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                <Plus size={16}/> Nueva Categoría
              </button>
            </div>
            
            <div className="space-y-6">
              {Object.entries(inventarioDB).map(([cat, catData]) => {
                const productos = catData.productos || [];
                const proveedor = catData.proveedor || 'Sin Proveedor';
                
                return (
                  <div key={cat} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 p-3 border-b border-slate-200 flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-700">{cat}</h3>
                          <button onClick={() => editarNombreCategoria(cat)} className="text-blue-500 hover:bg-blue-100 p-1 rounded transition-colors" title="Renombrar categoría">
                            <Edit2 size={14}/>
                          </button>
                        </div>
                        <p onClick={() => editarProveedor(cat, proveedor)} className="text-xs font-medium text-blue-600 flex items-center gap-1 mt-0.5 cursor-pointer hover:text-blue-800 transition-colors">
                          <Package size={12}/> Prov: {proveedor} <Edit2 size={10}/>
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => agregarArticulo(cat)} className="text-xs bg-white border border-slate-300 px-2 py-1.5 rounded text-slate-600 hover:bg-blue-50 font-medium">Añadir Art.</button>
                        <button onClick={() => eliminarCategoria(cat)} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1.5 rounded"><Trash2 size={14}/></button>
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-2">
                      {productos.length === 0 ? <span className="text-sm text-slate-400 italic">Sin productos.</span> : null}
                      {productos.map((prod, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm bg-white border border-slate-100 p-2 rounded shadow-sm group">
                          <span className="truncate pr-2">{prod}</span>
                          <button onClick={() => eliminarArticulo(cat, idx)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><X size={14}/></button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {adminTab === 'configuracion' && (
          <div className="max-w-lg">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b pb-4"><Settings className="text-blue-600"/> Ajustes del Sistema</h2>
            <form onSubmit={guardarConfiguracion} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Correo del Administrador (Recibe copias)</label>
                <input required type="email" className="w-full p-3 border border-slate-300 rounded-lg" value={adminConfig.adminEmail} onChange={e => setAdminConfig({...adminConfig, adminEmail: e.target.value})} />
                <p className="text-xs text-slate-500 mt-1">Este correo recibirá copia (CC) de todos los reportes enviados.</p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">PIN Administrador Principal</label>
                  <input required className="w-full p-3 border border-slate-300 rounded-lg" value={adminConfig.adminPin} onChange={e => setAdminConfig({...adminConfig, adminPin: e.target.value})} />
                  <p className="text-xs text-slate-500 mt-1">Contraseña maestra para acceder a este panel.</p>
                </div>
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 shadow-md">
                <Save size={18}/> Guardar Cambios
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );

  // VISTA NUEVO PEDIDO
  const renderNuevoPedido = () => (
    <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-8rem)] min-h-[600px]">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2"><ShoppingCart size={20} className="text-blue-600"/> Catálogo de Productos</h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input type="text" placeholder="Buscar producto (ej. Jitomate)..." className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="p-4 overflow-y-auto flex-1 bg-slate-50">
          {Object.entries(inventarioDB).map(([categoria, catData]) => {
            const productos = catData.productos || [];
            const proveedor = catData.proveedor || 'Sin Proveedor';
            const filtrados = productos.filter(p => p.toLowerCase().includes(searchTerm.toLowerCase()));
            if (filtrados.length === 0) return null;
            return (
              <div key={categoria} className="mb-6 bg-white p-4 rounded-lg shadow-sm border border-slate-100">
                <div className="border-b border-slate-100 pb-2 mb-3 sticky top-0 bg-white z-10">
                  <h3 className="font-bold text-slate-700">{categoria}</h3>
                  <span className="text-xs font-medium text-blue-600 flex items-center gap-1 mt-0.5"><Package size={12}/> {proveedor}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filtrados.map(producto => {
                    const cantidad = pedidoActual[producto] || 0;
                    return (
                      <div key={producto} className={`flex items-center justify-between p-3 rounded-lg border ${cantidad > 0 ? 'border-blue-200 bg-blue-50' : 'border-slate-100'}`}>
                        <span className="text-sm font-medium text-slate-700 w-1/2 pr-2 leading-tight">{producto}</span>
                        <div className="flex items-center bg-white border border-slate-200 rounded-md shadow-sm">
                          <button onClick={() => decrementar(producto)} className="p-2 hover:bg-slate-100"><Minus size={14} /></button>
                          <input type="number" min="0" step="0.5" className="w-14 text-center text-sm font-bold border-x py-1 outline-none" value={cantidad === 0 ? '' : cantidad} onChange={(e) => actualizarCantidad(producto, e.target.value)} placeholder="0" />
                          <button onClick={() => incrementar(producto)} className="p-2 hover:bg-slate-100"><Plus size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-full lg:w-96 xl:w-[400px] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[calc(100vh-8rem)] min-h-[600px]">
        <div className="p-3 border-b border-slate-100 bg-blue-600 text-white rounded-t-xl">
          <h2 className="text-lg font-bold flex items-center gap-2"><ClipboardList size={20} /> Resumen del Pedido</h2>
        </div>
        <div className="p-3 border-b border-slate-100 bg-blue-50">
          <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Sucursal Solicitante</label>
          <div className="flex items-center gap-2 text-slate-800 font-semibold bg-white p-2 rounded border border-blue-200"><Building size={18} className="text-blue-500" />{usuarioActual.nombre}</div>
          <p className="text-xs text-slate-500 mt-1">Supervisora: <strong>{usuarioActual.supervisora}</strong></p>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          {totalArticulos === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3"><ShoppingCart size={48} className="opacity-20" /><p className="text-sm text-center">No has agregado productos.</p></div>
          ) : (
            <div className="flex flex-col">
              {/* Encabezados de las columnas */}
              <div className="flex items-center justify-between pb-2 mb-3 border-b-2 border-slate-100">
                <div className="flex items-center w-full">
                  <span className="text-xs font-bold text-slate-500 uppercase w-12 text-center">Cant.</span>
                  <span className="text-xs font-bold text-slate-500 uppercase ml-2">Artículo</span>
                </div>
              </div>
              
              <ul className="space-y-3">
                {Object.entries(pedidoActual).map(([prod, cant]) => (
                  <li key={prod} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2">
                    <div className="flex items-start w-full">
                      <span className="font-bold text-blue-600 w-12 text-center shrink-0">{cant}</span>
                      <span className="text-slate-700 leading-tight pr-2 flex-1 ml-2">{prod}</span>
                    </div>
                    <button onClick={() => actualizarCantidad(prod, 0)} className="text-red-400 hover:text-red-600 p-1 flex-shrink-0" title="Eliminar"><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="p-3 border-t bg-white">
          <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Notas Extras</label>
          <textarea className="w-full p-2 border rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 resize-none" rows="2" value={notas} onChange={(e) => setNotas(e.target.value)}></textarea>
        </div>
        <div className="p-3 bg-slate-50 border-t rounded-b-xl">
          <button onClick={enviarPedido} className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 font-bold ${(totalArticulos > 0 || notas.trim() !== '') ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
            <Send size={18} /> Procesar Pedido
          </button>
        </div>
      </div>
    </div>
  );

  // VISTA REPORTES
  const renderReportes = () => {
    // 1. Filtrar primero por ROL (Admin y Comprador ven todo. Sucursales ven solo lo suyo)
    let pedidosAVisualizar = (usuarioActual.rol === 'admin' || usuarioActual.rol === 'comprador')
      ? historialPedidos 
      : historialPedidos.filter(p => p.sucursal === usuarioActual.nombre);

    // 2. Aplicar los Filtros Inteligentes (Si hay algo escrito en las barras de búsqueda)
    pedidosAVisualizar = pedidosAVisualizar.filter(pedido => {
      const matchId = pedido.id.toLowerCase().includes(filterId.toLowerCase());
      const matchSucursal = filterSucursal === '' || pedido.sucursal === filterSucursal;
      
      // La fecha viene del calendario en formato YYYY-MM-DD. El timestamp se guarda como YYYY-MM-DDTHH:mm:ss...
      const matchFecha = filterFecha === '' || (pedido.timestamp && pedido.timestamp.startsWith(filterFecha));
      
      return matchId && matchSucursal && matchFecha;
    });

    return (
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Mail className="text-blue-600"/> Registro de Pedidos</h2>
            <p className="text-sm text-slate-500 mt-1">Historial almacenado en la nube.</p>
          </div>
        </div>

        {/* BARRA DE FILTROS EXCLUSIVA PARA ADMIN Y COMPRADOR */}
        {(usuarioActual.rol === 'admin' || usuarioActual.rol === 'comprador') && (
          <div className="p-4 border-b border-slate-200 bg-white grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Buscar por Folio / ID</label>
              <div className="relative">
                <Filter className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Ej. PED-SA-0001" 
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" 
                  value={filterId} 
                  onChange={e => setFilterId(e.target.value)} 
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Filtrar por Sucursal</label>
              <div className="relative">
                <Building className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <select 
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-slate-50" 
                  value={filterSucursal} 
                  onChange={e => setFilterSucursal(e.target.value)}
                >
                  <option value="">Todas las sucursales</option>
                  {sucursalesDB.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-end mb-1">
                <label className="block text-xs font-bold text-slate-600 uppercase">Filtrar por Fecha</label>
                {filterFecha && (
                  <button onClick={() => setFilterFecha('')} className="text-[10px] text-red-500 hover:text-red-700 font-bold transition-colors">
                    Limpiar fecha
                  </button>
                )}
              </div>
              <div className="relative">
                <input 
                  type="date" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 text-slate-700 cursor-pointer" 
                  value={filterFecha} 
                  onChange={e => setFilterFecha(e.target.value)} 
                />
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-sm">
                <th className="p-4 font-semibold border-b">ID / Folio</th>
                <th className="p-4 font-semibold border-b">Sucursal</th>
                <th className="p-4 font-semibold border-b">Fecha</th>
                <th className="p-4 font-semibold border-b">Artículos</th>
                <th className="p-4 font-semibold border-b">Estado</th>
                <th className="p-4 font-semibold border-b text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pedidosAVisualizar.length === 0 ? (
                <tr><td colSpan="6" className="p-8 text-center text-slate-500">No se encontraron pedidos con estos filtros.</td></tr>
              ) : (
                pedidosAVisualizar.map(pedido => (
                  <tr key={pedido.dbId} className="hover:bg-slate-50">
                    <td className="p-4 font-bold text-slate-700">{pedido.id}</td>
                    <td className="p-4 font-semibold flex items-center gap-2"><Building size={14} className="text-slate-400"/> {pedido.sucursal}</td>
                    <td className="p-4 text-sm text-slate-600">{pedido.fecha}</td>
                    <td className="p-4 flex items-center gap-2">
                      {Object.keys(pedido.detalles).length} ref.
                      {pedido.notas && <MessageSquare size={16} className="text-amber-500" title={`Nota sucursal: ${pedido.notas}`} />}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium 
                          ${pedido.estado === 'Entregado' ? 'bg-green-100 text-green-700' : 
                            pedido.estado === 'En Proceso' ? 'bg-blue-100 text-blue-700' : 
                            pedido.estado === 'Problema / Incompleto' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'}`}>
                          {pedido.estado}
                        </span>
                        {pedido.notaComprador && <span className="text-[10px] text-slate-500 italic max-w-[150px] truncate" title={pedido.notaComprador}>Nota: {pedido.notaComprador}</span>}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center items-center gap-2">
                        {/* El botón de notificar correo está oculto para el comprador */}
                        {usuarioActual.rol !== 'comprador' && (
                          <button onClick={() => procesarCorreo(pedido.dbId, pedido.correoSupervisora)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100" title="Notificar a sucursal">
                            <Mail size={14}/> <span className="hidden lg:inline">Notificar</span>
                          </button>
                        )}
                        {/* El botón de actualizar estado (Exclusivo Comprador/Admin) */}
                        {(usuarioActual.rol === 'comprador' || usuarioActual.rol === 'admin') && (
                          <button onClick={() => setOrdenEditando({ dbId: pedido.dbId, estado: pedido.estado, notaComprador: pedido.notaComprador || '' })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100" title="Actualizar Estado">
                            <Edit size={14}/> <span className="hidden lg:inline">Actualizar</span>
                          </button>
                        )}
                        <button onClick={() => generarPDF(pedido.dbId)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-slate-800 text-white hover:bg-slate-700" title="Descargar PDF">
                          <FileDown size={14}/> <span className="hidden lg:inline">PDF</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 pb-10">
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <CheckCircle className="text-green-400" size={20} />
          <span className="font-medium text-sm">{toastMessage}</span>
        </div>
      )}

      <header className="bg-white border-b shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-600">
            <div className="bg-blue-600 p-1.5 rounded-lg text-white"><ClipboardList size={24} /></div>
            <h1 className="text-xl font-black tracking-tight hidden sm:block">Supply<span className="text-slate-800">Pro</span></h1>
          </div>
          
          <nav className="flex gap-2">
            {usuarioActual.rol === 'admin' && (
              <button onClick={() => setActiveView('admin-panel')} className={`px-3 py-2 rounded-lg font-bold flex items-center gap-2 ${activeView === 'admin-panel' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}>
                <Settings size={18} /> Panel Admin
              </button>
            )}
            {usuarioActual.rol === 'sucursal' && (
              <button onClick={() => setActiveView('nuevo-pedido')} className={`px-3 py-2 rounded-lg font-bold flex items-center gap-2 ${activeView === 'nuevo-pedido' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}>
                <Plus size={18} /> Pedido
              </button>
            )}
            <button onClick={() => setActiveView('reportes')} className={`px-3 py-2 rounded-lg font-bold flex items-center gap-2 ${activeView === 'reportes' ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}>
              <Mail size={18} /> Reportes
            </button>
          </nav>

          <div className="flex items-center gap-3 border-l pl-4">
            <div className="text-right hidden md:block">
              <p className="text-xs font-bold">
                {usuarioActual.rol === 'admin' ? 'Administrador' : usuarioActual.rol === 'comprador' ? 'Comprador' : usuarioActual.supervisora}
              </p>
              <p className="text-[10px] text-slate-500">{usuarioActual.nombre}</p>
            </div>
            <button onClick={handleLogout} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <main className="p-4 md:p-6 lg:p-8">
        {activeView === 'nuevo-pedido' && usuarioActual.rol === 'sucursal' && renderNuevoPedido()}
        {activeView === 'admin-panel' && usuarioActual.rol === 'admin' && renderAdminPanel()}
        {activeView === 'reportes' && renderReportes()}
      </main>

      {/* Modal para Actualizar Estado (Comprador/Admin) */}
      {ordenEditando && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Edit size={18} className="text-blue-600"/> Actualizar Pedido</h3>
              <button onClick={() => setOrdenEditando(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <form onSubmit={guardarEstadoPedido} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Estado de la compra</label>
                <select 
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                  value={ordenEditando.estado}
                  onChange={(e) => setOrdenEditando({...ordenEditando, estado: e.target.value})}
                >
                  <option value="Pendiente">Pendiente (Recién recibido)</option>
                  <option value="Correo Preparado">Correo Preparado</option>
                  <option value="En Proceso">En Proceso (Comprando...)</option>
                  <option value="Problema / Incompleto">Problema / Incompleto</option>
                  <option value="Entregado">Entregado (Surtido completo)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Notas del Comprador (Opcional)</label>
                <textarea 
                  className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-slate-50"
                  rows="3"
                  placeholder="Ej. Faltaron 2kg de Jitomate, estaban en mal estado..."
                  value={ordenEditando.notaComprador}
                  onChange={(e) => setOrdenEditando({...ordenEditando, notaComprador: e.target.value})}
                ></textarea>
                <p className="text-xs text-slate-500 mt-1">Esta nota será visible en el panel para explicar cambios o faltantes a la sucursal.</p>
              </div>
              <div className="pt-2">
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 shadow-md transition-colors">
                  <Save size={18}/> Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación Global */}
      {modalConfirm.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-fade-in">
            <h3 className="font-bold text-slate-800 text-lg mb-2">Confirmación</h3>
            <p className="text-slate-600 mb-6">{modalConfirm.mensaje}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setModalConfirm({ ...modalConfirm, isOpen: false })} className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">Cancelar</button>
              <button onClick={() => { modalConfirm.onConfirm(); setModalConfirm({ ...modalConfirm, isOpen: false }); }} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Entrada de Texto (Prompt) Global */}
      {modalPrompt.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-fade-in">
            <h3 className="font-bold text-slate-800 text-lg mb-4">{modalPrompt.titulo}</h3>
            <input 
              autoFocus
              type="text" 
              placeholder={modalPrompt.placeholder}
              className="w-full p-3 border border-slate-300 rounded-lg mb-6 outline-none focus:ring-2 focus:ring-blue-500"
              value={modalPrompt.valor}
              onChange={(e) => setModalPrompt({ ...modalPrompt, valor: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  modalPrompt.onConfirm(modalPrompt.valor);
                  setModalPrompt({ ...modalPrompt, isOpen: false });
                }
              }}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setModalPrompt({ ...modalPrompt, isOpen: false })} className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">Cancelar</button>
              <button onClick={() => { modalPrompt.onConfirm(modalPrompt.valor); setModalPrompt({ ...modalPrompt, isOpen: false }); }} className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
